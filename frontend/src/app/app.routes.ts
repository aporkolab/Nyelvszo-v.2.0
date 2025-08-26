import { Routes } from '@angular/router';

import { HomeComponent } from './page/home/home.component';
import { ForbiddenComponent } from './page/forbidden/forbidden.component';
import { LoginComponent } from './page/login/login.component';
import { EntriesComponent } from './page/entries/entries.component';
import { EntriesEditorComponent } from './page/entries-editor/entries-editor.component';
import { UsersComponent } from './page/users/users.component';
import { UsersEditorComponent } from './page/users-editor/users-editor.component';
import { PrefaceComponent } from './page/preface/preface.component';
import { VersionhistoryComponent } from './page/versionhistory/versionhistory.component';
import { ContactComponent } from './page/contact/contact.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'login', component: LoginComponent },
	{ path: 'forbidden', component: ForbiddenComponent },
	{ path: 'entries', component: EntriesComponent },
	{ path: 'entries/edit/:id', component: EntriesEditorComponent },
	{ path: 'users', component: UsersComponent },
	{ path: 'users/edit/:id', component: UsersEditorComponent },
	{ path: 'preface', component: PrefaceComponent },
	{ path: 'versionhistory', component: VersionhistoryComponent },
	{ path: 'contact', component: ContactComponent },
	{ path: '**', redirectTo: '' },
];
