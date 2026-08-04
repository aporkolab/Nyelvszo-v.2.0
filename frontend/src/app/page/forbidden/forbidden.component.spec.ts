import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ForbiddenComponent } from './forbidden.component';

describe('ForbiddenComponent', () => {
  let fixture: ComponentFixture<ForbiddenComponent>;
  let component: ForbiddenComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForbiddenComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ForbiddenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('offers a way back to the dictionary', () => {
    const link = fixture.nativeElement.querySelector('a.btn') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/entries');
  });
});
