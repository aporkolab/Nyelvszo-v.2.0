import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideToastr } from 'ngx-toastr';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { BaseService } from './base.service'; // vagy épp melyik service

describe('BaseService', () => {
  let service: BaseService<any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BaseService,
        provideHttpClientTesting(), // NG0201: HttpClient fix
        provideToastr(),            // Toastr token fix
        provideNoopAnimations(),    // Toastr-hoz animáció nélküli provider
      ],
    });
    service = TestBed.inject(BaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
