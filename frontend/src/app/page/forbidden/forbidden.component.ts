import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { IconModule } from 'src/app/icon/icon.module';

/**
 * Shown when the role guard turns a signed-in user away.
 *
 * It says what happened and offers the one useful way out. The previous version
 * animated an illustration of a server through a stylesheet that was never
 * registered on the component, so it rendered as a column of empty divs.
 */
@Component({
  standalone: true,
  selector: 'app-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslateModule, IconModule],
  templateUrl: './forbidden.component.html',
})
export class ForbiddenComponent {}
