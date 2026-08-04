import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { IconModule } from 'src/app/icon/icon.module';

/**
 * Catch-all screen for an address that matches no route.
 *
 * The wildcard route used to redirect to the search page, which made a mistyped
 * or stale link look like a working one that had simply found nothing.
 */
@Component({
  standalone: true,
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslateModule, IconModule],
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent {}
