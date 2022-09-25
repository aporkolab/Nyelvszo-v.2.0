import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavbarComponent } from './common/navbar/navbar.component';
import { HomeComponent } from './page/home/home.component';
import { BrowserModule } from '@angular/platform-browser';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { ForbiddenComponent } from './page/forbidden/forbidden.component';
import { LoginComponent } from './page/login/login.component';
import { EntriesComponent } from './page/entries/entries.component';
import { EntriesEditorComponent } from './page/entries-editor/entries-editor.component';
import { UsersComponent } from './page/users/users.component';
import { UsersEditorComponent } from './page/users-editor/users-editor.component';
import { IconModule } from './icon/icon.module';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ConfigService, IMenuItem } from './service/config.service';
import { DataTableModule } from './data-table/data-table.module';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    HomeComponent,
    ForbiddenComponent,
    LoginComponent,
    EntriesComponent,
    EntriesEditorComponent,
    UsersComponent,
    UsersEditorComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
DataTableModule,
    IconModule,
    HttpClientModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot({
      positionClass: 'toast-top-center',
      onActivateTick: true,
      closeButton: true,
      preventDuplicates: true,
      timeOut: 5000,
      extendedTimeOut: 3000,
    }),
    FontAwesomeModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {   sidebar: IMenuItem[] = this.config.sidebarMenu;

  constructor(private config: ConfigService) {}}
