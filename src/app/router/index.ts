import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
} from 'vue-router';

import ImportNotePage from '@/pages/import-note/ui/ImportNotePage.vue';
import NoteEditPage from '@/pages/note-edit/ui/NoteEditPage.vue';
import NoteViewPage from '@/pages/note-view/ui/NoteViewPage.vue';
import NotesListPage from '@/pages/notes-list/ui/NotesListPage.vue';

function param(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function viewProps(route: RouteLocationNormalized): { id: string } {
  return { id: param(route.params['id']) };
}

function editProps(route: RouteLocationNormalized): {
  mode: 'edit';
  id: string;
} {
  return { mode: 'edit', id: param(route.params['id']) };
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
      path: '/note/:id/edit',
      name: 'note-edit',
      component: NoteEditPage,
      props: editProps,
      sensitive: true,
    },
    {
      path: '/note/:id',
      name: 'note-view',
      component: NoteViewPage,
      props: viewProps,
      sensitive: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: { name: 'notes-list' },
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
