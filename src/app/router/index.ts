import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
} from 'vue-router';

import ImportNotePage from '@/pages/import-note/ui/ImportNotePage.vue';
import NoteEditPage from '@/pages/note-edit/ui/NoteEditPage.vue';
import NoteViewPage from '@/pages/note-view/ui/NoteViewPage.vue';
import NotesListPage from '@/pages/notes-list/ui/NotesListPage.vue';

function pathFromParams(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('/');
  }
  return typeof value === 'string' ? value : '';
}

function viewProps(route: RouteLocationNormalized): { path: string } {
  return { path: pathFromParams(route.params['pathMatch']) };
}

function editProps(route: RouteLocationNormalized): {
  mode: 'edit';
  path: string;
} {
  return { mode: 'edit', path: pathFromParams(route.params['pathMatch']) };
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'notes-list',
      component: NotesListPage,
      sensitive: true,
    },
    {
      path: '/create',
      name: 'note-create',
      component: NoteEditPage,
      props: { mode: 'create' },
      sensitive: true,
    },
    {
      path: '/shared',
      name: 'note-shared',
      component: ImportNotePage,
      sensitive: true,
    },
    {
      path: '/:pathMatch(.*)*/edit',
      name: 'note-edit',
      component: NoteEditPage,
      props: editProps,
      sensitive: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'note-view',
      component: NoteViewPage,
      props: viewProps,
      sensitive: true,
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return false;
    }
    return { top: 0 };
  },
});

export default router;
