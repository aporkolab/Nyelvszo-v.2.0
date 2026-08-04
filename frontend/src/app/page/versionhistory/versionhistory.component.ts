import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * The changelog.
 *
 * The entries are the authors' own Hungarian notes and are kept verbatim; only
 * the page title and lead are translated. Previously the whole log was a single
 * malformed <ul> in which every actual change was a bare text node between
 * <br> tags, so assistive technology announced one four-item list containing
 * none of the changes.
 */
@Component({
  selector: 'app-versionhistory',
  imports: [TranslateModule],
  templateUrl: './versionhistory.component.html',
  styleUrl: './versionhistory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionhistoryComponent {}
