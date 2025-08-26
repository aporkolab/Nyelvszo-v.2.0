// entries-editor.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';         // <<< EZ KELL
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { EntriesEditorComponent } from './entries-editor.component';
import { Entry } from '../../model/entry';

describe('EntriesEditorComponent', () => {
  let component: EntriesEditorComponent;
  let fixture: ComponentFixture<EntriesEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        EntriesEditorComponent,     // standalone
        ReactiveFormsModule,        // <<< FormsModule helyett EZ
        HttpClientTestingModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
        ToastrModule.forRoot(),
        NoopAnimationsModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EntriesEditorComponent);
    component = fixture.componentInstance;

    const mockEntry: Entry = {
      _id: '1',
      id: 1,
      english: 'Test Word',
      hungarian: 'Teszt szó',
      fieldOfExpertise: 'general',
      wordType: 'noun',
      description: 'Test Description',
      example: 'Test Example',
      sound: 'Test Sound',
      topic: 'Test Topic',
      language: 'en',
    };

    // @Input előbb:
    component.entry = mockEntry;

    // ha a komponens NEM ngOnInit-ben hozza létre a formot, biztosítsd itt:
    // component.form = new FormGroup({ ... });  // csak ha szükséges

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
