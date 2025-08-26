import { EntryService } from 'src/app/service/entry.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideToastr } from 'ngx-toastr';
import { provideNoopAnimations } from '@angular/platform-browser/animations';


describe('BaseService', () => {
  let service: EntryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EntryService,
        provideHttpClientTesting(), // NG0201: HttpClient fix
        provideToastr(),            // Toastr token fix
        provideNoopAnimations(),    // Toastr-hoz animáció nélküli provider
      ],
    });
    service = TestBed.inject(EntryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
