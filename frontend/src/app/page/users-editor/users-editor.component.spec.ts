// src/app/page/users-editor/users-editor.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';

import { UsersEditorComponent } from './users-editor.component';
import { User } from '../../model/user'; // igazítsd az elérési utat

function createUser(overrides: Partial<User> = {}): User {
  return {
    _id: 'u-1',
    id: 1,
    firstName: 'Test',
    lastName: 'User',
    name: 'Test User',
    email: 'test@test.com',
    password: 'Password1',
    role: 1,
    active: true,
    language: 'en',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as User;
}

describe('UsersEditorComponent', () => {
  let component: UsersEditorComponent;
  let fixture: ComponentFixture<UsersEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UsersEditorComponent,       // standalone komponens
        FormsModule,                // template-driven formokhoz
        HttpClientTestingModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
        ToastrModule.forRoot(),
        NoopAnimationsModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UsersEditorComponent);
    component = fixture.componentInstance;

    // @Input beállítás az első change detection előtt
    component.user = createUser();

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
