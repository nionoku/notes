/**
 * Google Apps Script backend для синхронизации Notes с Google Drive.
 *
 * Команда клиента приходит через iframe-мост (Bridge.html), потому что
 * Apps Script Web App не отдаёт CORS-заголовки для обычного fetch.
 */

const ROOT_FOLDER_NAME = 'Notes Sync';
const MAX_SYNC_BYTES = 8 * 1024 * 1024;
const TOKEN_PROPERTY = 'SYNC_TOKEN';
const HASH_DIRECTORY_PATTERN = /^[0-9a-f]{32}$/i;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Bridge')
    .setTitle('Notes Sync Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Вызывается из Bridge.html через google.script.run.
 * @param {string} requestJson JSON {method, token, params}.
 * @return {Object} Ответ, сериализуемый Apps Script.
 */
function bridge(requestJson) {
  try {
    const request = JSON.parse(requestJson || '{}');
    const expectedToken = PropertiesService.getScriptProperties()
      .getProperty(TOKEN_PROPERTY) || '';

    if (!expectedToken || request.token !== expectedToken) {
      return {ok: false, error: 'Неверный токен доступа.'};
    }

    const params = request.params || {};
    switch (request.method) {
      case 'ping':
        return {ok: true, result: {version: 1}};
      case 'manifest':
        return {ok: true, result: buildManifest()};
      case 'download':
        return {ok: true, result: downloadFile(params.path)};
      case 'upload':
        return {
          ok: true,
          result: uploadFile(params.path, params.base64, params.hash),
        };
      case 'delete':
        return {ok: true, result: tombstoneFolder(params.path)};
      default:
        return {ok: false, error: 'Неизвестный метод синхронизации.'};
    }
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

/** Создаёт токен и печатает его в журнал выполнения. */
function setupSync() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(TOKEN_PROPERTY)) {
    properties.setProperty(TOKEN_PROPERTY, Utilities.getUuid());
  }
  Logger.log('SYNC_TOKEN=' + properties.getProperty(TOKEN_PROPERTY));
}

function buildManifest() {
  const files = [];
  const root = getRootFolder();
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (!HASH_DIRECTORY_PATTERN.test(folder.getName())) {
      continue;
    }
    walkFolder(folder, folder.getName() + '/', files);
  }
  return {files: files};
}

function walkFolder(folder, prefix, files) {
  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    if (
      file.isTrashed() ||
      isDeletedName(file.getName()) ||
      isHiddenName(file.getName())
    ) {
      continue;
    }
    const size = file.getSize();
    if (size > MAX_SYNC_BYTES) {
      continue;
    }
    const bytes = file.getBlob().getBytes();
    files.push({
      path: prefix + file.getName(),
      hash: hashBytes(bytes),
      size: size,
      modified: file.getLastUpdated().getTime(),
    });
  }

  const folderIterator = folder.getFolders();
  while (folderIterator.hasNext()) {
    const child = folderIterator.next();
    if (isDeletedName(child.getName()) || isHiddenName(child.getName())) {
      continue;
    }
    walkFolder(child, prefix + child.getName() + '/', files);
  }
}

function downloadFile(path) {
  const file = findFile(path);
  if (!file) {
    throw new Error('Файл не найден в Google Drive: ' + path);
  }
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > MAX_SYNC_BYTES) {
    throw new Error('Файл слишком большой для синхронизации: ' + path);
  }
  return {
    path: path,
    hash: hashBytes(bytes),
    size: bytes.length,
    modified: file.getLastUpdated().getTime(),
    base64: Utilities.base64Encode(bytes),
  };
}

function uploadFile(path, base64, requestedHash) {
  if (!base64) {
    throw new Error('Пустое содержимое файла.');
  }
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_SYNC_BYTES) {
    throw new Error('Файл слишком большой для синхронизации: ' + path);
  }

  const hash = hashBytes(bytes);
  if (requestedHash && requestedHash !== hash) {
    throw new Error('Хэш загружаемого файла не совпал: ' + path);
  }

  const segments = splitPath(path);
  const fileName = segments.pop();
  const folder = getOrCreateFolder(segments);
  const existing = findFileInFolder(folder, fileName);
  if (existing) {
    existing.setTrashed(true);
  }

  const file = folder.createFile(
    Utilities.newBlob(bytes, mimeTypeForName(fileName), fileName),
  );
  return {
    path: path,
    hash: hash,
    size: bytes.length,
    modified: file.getLastUpdated().getTime(),
  };
}

function isDeletedName(name) {
  return String(name).charAt(0) === '~';
}

function isHiddenName(name) {
  return String(name).charAt(0) === '.';
}

function findFolder(path) {
  let folder = getRootFolder();
  const segments = splitPath(path);
  for (let index = 0; index < segments.length; index += 1) {
    const iterator = folder.getFoldersByName(segments[index]);
    if (!iterator.hasNext()) {
      return null;
    }
    folder = iterator.next();
  }
  return folder;
}

function tombstoneFolder(path) {
  const folder = findFolder(path);
  if (folder && !isDeletedName(folder.getName())) {
    // Keep the folder and all its contents on Drive, but hide it from sync.
    folder.setName('~' + folder.getName());
  }
  return {path: path, deleted: Boolean(folder)};
}

function getRootFolder() {
  const driveRoot = DriveApp.getRootFolder();
  const iterator = driveRoot.getFoldersByName(ROOT_FOLDER_NAME);
  if (iterator.hasNext()) {
    return iterator.next();
  }
  return driveRoot.createFolder(ROOT_FOLDER_NAME);
}

function getOrCreateFolder(segments) {
  let folder = getRootFolder();
  for (let index = 0; index < segments.length; index += 1) {
    const name = segments[index];
    const iterator = folder.getFoldersByName(name);
    folder = iterator.hasNext() ? iterator.next() : folder.createFolder(name);
  }
  return folder;
}

function findFile(path) {
  const segments = splitPath(path);
  const fileName = segments.pop();
  let folder = getRootFolder();

  for (let index = 0; index < segments.length; index += 1) {
    const iterator = folder.getFoldersByName(segments[index]);
    if (!iterator.hasNext()) {
      return null;
    }
    folder = iterator.next();
  }

  return findFileInFolder(folder, fileName);
}

function findFileInFolder(folder, fileName) {
  const iterator = folder.getFilesByName(fileName);
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (!file.isTrashed()) {
      return file;
    }
  }
  return null;
}

function splitPath(path) {
  if (typeof path !== 'string') {
    throw new Error('Некорректный путь файла.');
  }
  const normalized = path.replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (
    !segments.length ||
    segments.some(function (segment) {
      return !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.indexOf('\\') !== -1 ||
        /[\u0000-\u001f]/.test(segment);
    })
  ) {
    throw new Error('Некорректный путь файла.');
  }
  return segments;
}

function hashBytes(bytes) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes,
  );
  return digest.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function mimeTypeForName(name) {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}
