import { UsersEditorComponent } from './page/users-editor/users-editor.component';
import { UsersComponent } from './page/users/users.component';
import { EntriesComponent } from './page/entries/entries.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ForbiddenComponent } from './page/forbidden/forbidden.component';
import { HomeComponent } from './page/home/home.component';
import { LoginComponent } from './page/login/login.component';

 import { AuthGuardService } from './service/auth-guard.service';
  import { RoleGuardService } from './service/role-guard.service';



const routes: Routes = [  {
  path: '',
  component: HomeComponent,
},
{
  path: '**',
  component: HomeComponent,
},
{
  path: '',
  component: HomeComponent,
},
{
  path: 'login',
  component: LoginComponent,
},
{
  path: 'forbidden',
  component: ForbiddenComponent,
},
{
  path: 'entries',
  component: EntriesComponent,
  canActivate: [AuthGuardService, RoleGuardService],
  data: {
    expectedRole: 1,
  },
},
{
  path: 'users',
  component: UsersComponent,
  canActivate: [AuthGuardService, RoleGuardService],
  data: {
    expectedRole: 3,
  },
},
{
  path: 'users/edit/`0`',
  component: UsersEditorComponent,
  canActivate: [AuthGuardService, RoleGuardService],
  data: {
    expectedRole: 3,
  },
},
{
  path: 'users/edit/:id',
  component: UsersEditorComponent,
  canActivate: [AuthGuardService, RoleGuardService],
  data: {
    expectedRole: 3,
  },
},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
