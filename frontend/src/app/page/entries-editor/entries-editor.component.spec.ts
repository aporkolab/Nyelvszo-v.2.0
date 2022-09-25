import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntriesEditorComponent } from './entries-editor.component';

describe('EntriesEditorComponent', () => {
  let component: EntriesEditorComponent;
  let fixture: ComponentFixture<EntriesEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EntriesEditorComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EntriesEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
