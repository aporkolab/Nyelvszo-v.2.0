import { Routes } from '@angular/router';

import { ForbiddenComponent } from './page/forbidden/forbidden.component';
import { LoginComponent } from './page/login/login.component';
import { EntriesComponent } from './page/entries/entries.component';
import { EntriesEditorComponent } from './page/entries-editor/entries-editor.component';
import { UsersComponent } from './page/users/users.component';
import { UsersEditorComponent } from './page/users-editor/users-editor.component';
import { PrefaceComponent } from './page/preface/preface.component';
import { VersionhistoryComponent } from './page/versionhistory/versionhistory.component';
import { ContactComponent } from './page/contact/contact.component';
import { AuthGuardService } from './service/auth-guard.service';
import { RoleGuardService } from './service/role-guard.service';

export const routes: Routes = [
  { path: '', component: EntriesComponent },
  { path: 'login', component: LoginComponent },
  { path: 'forbidden', component: ForbiddenComponent },
  { path: 'entries', component: EntriesComponent },
  {
    path: 'entries/edit/:id',
    component: EntriesEditorComponent,
    canActivate: [AuthGuardService, RoleGuardService],
    data: { expectedRole: 2 },
  },
  {
    path: 'users',
    component: UsersComponent,
    canActivate: [AuthGuardService, RoleGuardService],
    data: { expectedRole: 3 },
  },
  {
    path: 'users/edit/:id',
    component: UsersEditorComponent,
    canActivate: [AuthGuardService, RoleGuardService],
    data: { expectedRole: 3 },
  },
  { path: 'preface', component: PrefaceComponent },
  { path: 'versionhistory', component: VersionhistoryComponent },
  { path: 'contact', component: ContactComponent },
  { path: '**', redirectTo: '' },
];
