import {createPinia} from 'pinia';
import {createApp} from 'vue';

import App from '@/App.vue';
import {
  bindDriveConfigFromQuery,
  stripDriveSecretsFromUrl,
} from '@/features/sync-drive/model/drive-config';
import router from '@/app/router';
import {applyDocumentLocale, i18n} from '@/shared/i18n';
import '@/app/styles/reset.css';
import '@/app/styles/global.css';

bindDriveConfigFromQuery();

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(router);
applyDocumentLocale();
app.mount('#app');

void router.isReady().then(() => {
  stripDriveSecretsFromUrl();
});

if (import.meta.env.PROD) {
  void import('@/features/pwa-update/model/register-pwa').then(
    ({registerPwa}) => {
      registerPwa();
    },
  );
}
