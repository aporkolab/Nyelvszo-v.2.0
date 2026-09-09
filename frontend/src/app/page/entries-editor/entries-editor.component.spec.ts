import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { EntriesEditorComponent } from './entries-editor.component';

describe('EntriesEditorComponent', () => {
  let component: EntriesEditorComponent;
  let fixture: ComponentFixture<EntriesEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntriesEditorComponent, TranslateModule.forRoot(),],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        // `0` is the create route, so the component renders its form without
        // issuing a request.
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '0' })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EntriesEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts invalid so an empty entry cannot be submitted', () => {
    const form = (component as unknown as { form: { invalid: boolean } }).form;
    expect(form.invalid).toBeTrue();
  });

  it('renders an input for every entry field', () => {
    const element: HTMLElement = fixture.nativeElement;

    for (const id of ['hungarian', 'english', 'fieldOfExpertise', 'wordType']) {
      expect(element.querySelector(`#${id}`))
        .withContext(id)
        .not.toBeNull();
    }
  });
});
