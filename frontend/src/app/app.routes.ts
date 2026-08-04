import { Routes } from '@angular/router';

import { authGuard, roleGuard } from './service/auth.guard';
import { UserRole } from './model/user';

/**
 * Application routes.
 *
 * Every screen is lazily loaded, so the initial bundle carries only the search
 * page. The guards here are a convenience for the user, not a security
 * boundary — the API enforces the same rules independently.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'entries',
  },
  {
    path: 'entries',
    title: 'NyelvSzó',
    loadComponent: () => import('./page/entries/entries.component').then(m => m.EntriesComponent),
  },
  {
    path: 'entries/edit/:id',
    title: 'NyelvSzó — Entry',
    canActivate: [authGuard, roleGuard],
    data: { expectedRole: UserRole.Editor },
    loadComponent: () =>
      import('./page/entries-editor/entries-editor.component').then(m => m.EntriesEditorComponent),
  },
  {
    path: 'users',
    title: 'NyelvSzó — Users',
    canActivate: [authGuard, roleGuard],
    data: { expectedRole: UserRole.Admin },
    loadComponent: () => import('./page/users/users.component').then(m => m.UsersComponent),
  },
  {
    path: 'users/edit/:id',
    title: 'NyelvSzó — User',
    canActivate: [authGuard, roleGuard],
    data: { expectedRole: UserRole.Admin },
    loadComponent: () =>
      import('./page/users-editor/users-editor.component').then(m => m.UsersEditorComponent),
  },
  {
    path: 'preface',
    title: 'NyelvSzó — Preface',
    loadComponent: () => import('./page/preface/preface.component').then(m => m.PrefaceComponent),
  },
  {
    path: 'versionhistory',
    title: 'NyelvSzó — Version history',
    loadComponent: () =>
      import('./page/versionhistory/versionhistory.component').then(m => m.VersionhistoryComponent),
  },
  {
    path: 'contact',
    title: 'NyelvSzó — Contact',
    loadComponent: () => import('./page/contact/contact.component').then(m => m.ContactComponent),
  },
  {
    path: 'login',
    title: 'NyelvSzó — Sign in',
    loadComponent: () => import('./page/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forbidden',
    title: 'NyelvSzó — Access denied',
    loadComponent: () =>
      import('./page/forbidden/forbidden.component').then(m => m.ForbiddenComponent),
  },
  {
    // A real not-found screen rather than a silent redirect, so a mistyped URL
    // is visible instead of quietly landing on the search page.
    path: '**',
    title: 'NyelvSzó — Not found',
    loadComponent: () =>
      import('./page/not-found/not-found.component').then(m => m.NotFoundComponent),
  },
];
