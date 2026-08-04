import { WritableSignal, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { User, UserRole } from '../../model/user';
import { AuthService } from '../../service/auth.service';
import { ThemePreference, ThemeService } from '../../service/theme.service';
import { SiteHeaderComponent } from './site-header.component';

/** The four members of AuthService the header actually reads. */
class FakeAuthService {
  readonly user: WritableSignal<User | null> = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly logout = jasmine.createSpy('logout');

  hasRole(role: UserRole): boolean {
    const user = this.user();
    return user ? user.role >= role : false;
  }

  signIn(role: UserRole): void {
    this.user.set(
      new User({
        _id: 'u1',
        firstName: 'Ádám',
        lastName: 'Porkoláb',
        email: 'adam@example.org',
        role,
      })
    );
  }
}

class FakeThemeService {
  private readonly preference = signal<ThemePreference>('system');

  readonly current = this.preference.asReadonly();
  readonly resolved = computed<'light' | 'dark'>(() =>
    this.preference() === 'dark' ? 'dark' : 'light'
  );

  readonly set = jasmine
    .createSpy('set')
    .and.callFake((value: ThemePreference) => this.preference.set(value));
}

describe('SiteHeaderComponent', () => {
  let fixture: ComponentFixture<SiteHeaderComponent>;
  let component: SiteHeaderComponent;
  let auth: FakeAuthService;
  let theme: FakeThemeService;

  beforeEach(async () => {
    auth = new FakeAuthService();
    theme = new FakeThemeService();

    await TestBed.configureTestingModule({
      imports: [SiteHeaderComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth as unknown as AuthService },
        { provide: ThemeService, useValue: theme as unknown as ThemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiteHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** The `routerLink` values of the rendered navigation links. */
  function navLinks(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.nav__link'))
      .map(element => element.attributes['href'] ?? '');
  }

  describe('navigation', () => {
    it('hides the Users link from an anonymous visitor', () => {
      expect(navLinks()).not.toContain('/users');
    });

    it('hides the Users link from a viewer', () => {
      auth.signIn(UserRole.User);
      fixture.detectChanges();

      expect(component.navItems().some(item => item.link === '/users')).toBeFalse();
      expect(navLinks()).not.toContain('/users');
      expect(navLinks()).toContain('/entries');
    });

    it('hides the Users link from an editor', () => {
      auth.signIn(UserRole.Editor);
      fixture.detectChanges();

      expect(navLinks()).not.toContain('/users');
    });

    it('shows the Users link to an administrator', () => {
      auth.signIn(UserRole.Admin);
      fixture.detectChanges();

      expect(component.navItems().some(item => item.link === '/users')).toBeTrue();
      expect(navLinks()).toContain('/users');
    });
  });

  describe('account controls', () => {
    it('offers sign-in while signed out', () => {
      const signIn = fixture.debugElement.query(By.css('a[href="/login"]'));
      const signOut = fixture.debugElement.query(By.css('.btn--secondary'));

      expect(signIn).toBeTruthy();
      expect(signOut).toBeNull();
      expect(component.isAuthenticated()).toBeFalse();
    });

    it('offers sign-out, the name and the role once signed in', () => {
      auth.signIn(UserRole.Admin);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('a[href="/login"]'))).toBeNull();

      const signOut = fixture.debugElement.query(By.css('.btn--secondary'));
      expect(signOut).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.account__name').textContent).toContain(
        'Ádám Porkoláb'
      );

      signOut.nativeElement.click();
      expect(auth.logout).toHaveBeenCalled();
    });

    it('names each role for the badge, and says so when it is unrecognised', () => {
      expect(component.roleDescriptionKey(UserRole.Admin)).toBe('roles.admin');
      expect(component.roleDescriptionKey(UserRole.Editor)).toBe('roles.editor');
      expect(component.roleDescriptionKey(UserRole.User)).toBe('roles.viewer');
      expect(component.roleDescriptionKey(99 as UserRole)).toBe('roles.unknown');
    });
  });

  describe('mobile menu', () => {
    it('starts closed and flips on every toggle', () => {
      expect(component.menuOpen()).toBeFalse();

      component.toggleMenu();
      expect(component.menuOpen()).toBeTrue();

      component.toggleMenu();
      expect(component.menuOpen()).toBeFalse();
    });

    it('reflects the open state on the panel and the disclosure button', () => {
      const toggle = fixture.debugElement.query(By.css('.nav-toggle'));

      toggle.nativeElement.click();
      fixture.detectChanges();

      expect(toggle.nativeElement.getAttribute('aria-expanded')).toBe('true');
      expect(fixture.nativeElement.querySelector('#primary-navigation').classList).toContain(
        'is-open'
      );
    });
  });

  describe('theme', () => {
    it('cycles system → light → dark → system', () => {
      expect(component.themePreference()).toBe('system');
      expect(component.themeIcon()).toBe('monitor');

      component.cycleTheme();
      expect(theme.set).toHaveBeenCalledWith('light');
      expect(component.themePreference()).toBe('light');
      expect(component.themeIcon()).toBe('sun');

      component.cycleTheme();
      expect(theme.set).toHaveBeenCalledWith('dark');
      expect(component.themePreference()).toBe('dark');
      expect(component.themeIcon()).toBe('moon');

      component.cycleTheme();
      expect(theme.set).toHaveBeenCalledWith('system');
      expect(component.themePreference()).toBe('system');
      expect(component.resolvedTheme()).toBe('light');
    });
  });

  describe('language', () => {
    it('switches the active language through the translate service', () => {
      component.translate.addLangs(['hu', 'en']);
      fixture.detectChanges();

      component.switchLanguage('en');
      fixture.detectChanges();

      expect(component.currentLang()).toBe('en');
      expect(component.languages()).toEqual(['hu', 'en']);
    });
  });
});
