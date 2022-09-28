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
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ConfigService, IMenuItem } from './service/config.service';
import { DataTableModule } from './data-table/data-table.module';
import { PrefaceComponent } from './page/preface/preface.component';
import { VersionhistoryComponent } from './page/versionhistory/versionhistory.component';
import { ContactComponent } from './page/contact/contact.component';
import { JwtInterceptor } from './service/jwt.interceptor';
import { AuthService } from './service/auth.service';

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
    UsersEditorComponent,
    PrefaceComponent,
    VersionhistoryComponent,
    ContactComponent
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
  ],
  exports: [FormsModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      deps: [AuthService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {   sidebar: IMenuItem[] = this.config.sidebarMenu;

  constructor(private config: ConfigService) {}}
