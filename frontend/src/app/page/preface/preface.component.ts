import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * The preface to the first edition, plus the bibliography the dictionary was
 * compiled from.
 *
 * The body is a static scholarly text written by the authors in Hungarian. It
 * is deliberately not routed through the translation pipe: there is no
 * authorised English rendering of it, and an invented one would misrepresent
 * the authors. Only the page title is translated.
 */
@Component({
  selector: 'app-preface',
  imports: [TranslateModule],
  templateUrl: './preface.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrefaceComponent {}
