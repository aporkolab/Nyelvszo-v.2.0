import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthService } from '../../service/auth.service';
import { ThemeService, ThemePreference } from '../../service/theme.service';
import { UserRole } from '../../model/user';
import { IconModule } from '../../icon/icon.module';

interface NavItem {
  readonly link: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly minimumRole?: UserRole;
}

const NAV_ITEMS: readonly NavItem[] = [
  { link: '/entries', labelKey: 'menu.entries', icon: 'search' },
  { link: '/preface', labelKey: 'menu.preface', icon: 'book-open' },
  { link: '/versionhistory', labelKey: 'menu.versionHistory', icon: 'file-text' },
  { link: '/contact', labelKey: 'menu.contact', icon: 'mail' },
  { link: '/users', labelKey: 'menu.users', icon: 'users', minimumRole: UserRole.Admin },
];

@Component({
  selector: 'app-site-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslateModule, IconModule],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  readonly translate = inject(TranslateService);

  readonly user = this.auth.user;
  readonly isAuthenticated = this.auth.isAuthenticated;

  readonly themePreference = this.theme.current;
  readonly resolvedTheme = this.theme.resolved;

  readonly menuOpen = signal(false);

  /** Only the destinations the current user is allowed to reach. */
  readonly navItems = computed(() =>
    NAV_ITEMS.filter(item => !item.minimumRole || this.auth.hasRole(item.minimumRole))
  );

  readonly languages = computed(() => this.translate.getLangs());

  /**
   * Current language, tracked reactively so the select stays in sync when the
   * language is changed from anywhere else.
   */
  readonly currentLang = toSignal(this.translate.onLangChange.pipe(map(event => event.lang)), {
    initialValue: this.translate.currentLang ?? 'hu',
  });

  constructor() {
    // A navigation with the mobile menu open would otherwise leave the panel
    // covering the page it just navigated to.
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  /**
   * Human-readable description of what a role may do.
   *
   * @param role - Numeric role from the user record.
   * @returns Translation key describing the role's permissions.
   */
  roleDescriptionKey(role: UserRole): string {
    switch (role) {
      case UserRole.Admin:
        return 'roles.admin';
      case UserRole.Editor:
        return 'roles.editor';
      case UserRole.User:
        return 'roles.viewer';
      default:
        return 'roles.unknown';
    }
  }

  switchLanguage(lang: string): void {
    this.translate.use(lang);
  }

  cycleTheme(): void {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.themePreference()) + 1) % order.length];
    this.theme.set(next);
  }

  themeIcon(): string {
    switch (this.themePreference()) {
      case 'light':
        return 'sun';
      case 'dark':
        return 'moon';
      default:
        return 'monitor';
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
