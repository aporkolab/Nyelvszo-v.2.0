import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { IconModule } from '../../icon/icon.module';

/**
 * Who to write to, and under what terms the dictionary may be used.
 *
 * The addresses used to be spelled out as "adam(kukac)porkolab pont hu" to
 * dodge harvesters, which meant no reader could click them and anyone using a
 * screen reader heard nonsense. They are plain `mailto:` links now.
 */
@Component({
  selector: 'app-contact',
  imports: [TranslateModule, IconModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  readonly currentYear = new Date().getFullYear();
}
