import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { importProvidersFrom } from '@angular/core';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// modul alapú libek:
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ToastrModule } from 'ngx-toastr';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

// saját modulok/szolgáltatók
import { IconModule } from './app/icon/icon.module';
import { DataTableModule } from './app/data-table/data-table.module';
import { JwtInterceptor } from './app/service/jwt.interceptor';
import { AuthService } from './app/service/auth.service';
import { ConfigService } from './app/service/config.service';

export function httpTranslateLoader(http: HttpClient) {
  return new TranslateHttpLoader(http);
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    importProvidersFrom(
      // NgModule-alapú csomagok itt:
      FormsModule,
      ReactiveFormsModule,
      HttpClientModule,
      IconModule,
      DataTableModule,
      ToastrModule.forRoot({
        positionClass: 'toast-top-center',
        onActivateTick: true,
        closeButton: true,
        preventDuplicates: true,
        timeOut: 5000,
        extendedTimeOut: 3000,
      }),
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: httpTranslateLoader,
          deps: [HttpClient],
        },
      })
    ),
    { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
    AuthService,
    ConfigService
  ],
}).catch(err => console.error(err));
