import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ToastrModule } from 'ngx-toastr';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

import { EntriesEditorComponent } from './entries-editor.component';

describe('EntriesEditorComponent', () => {
  let component: EntriesEditorComponent;
  let fixture: ComponentFixture<EntriesEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        EntriesEditorComponent,
        HttpClientTestingModule,
        ToastrModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
        FormsModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EntriesEditorComponent);
    component = fixture.componentInstance;
    component.entry = {
      id: 1,
      word: 'Test Word',
      description: 'Test Description',
      example: 'Test Example',
      sound: 'Test Sound',
      topic: 'Test Topic',
      language: 'Test Language',
    };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
