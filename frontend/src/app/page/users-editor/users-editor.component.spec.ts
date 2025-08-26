import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ToastrModule } from 'ngx-toastr';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

import { UsersEditorComponent } from './users-editor.component';

describe('UsersEditorComponent', () => {
  let component: UsersEditorComponent;
  let fixture: ComponentFixture<UsersEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UsersEditorComponent,
        HttpClientTestingModule,
        ToastrModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
        FormsModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UsersEditorComponent);
    component = fixture.componentInstance;
    component.user = {
      id: 1,
      name: 'Test User',
      email: 'test@test.com',
      password: 'password',
      role: 1,
      active: true,
    };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
