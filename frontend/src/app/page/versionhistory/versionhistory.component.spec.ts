import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { VersionhistoryComponent } from './versionhistory.component';

describe('VersionhistoryComponent', () => {
  let component: VersionhistoryComponent;
  let fixture: ComponentFixture<VersionhistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VersionhistoryComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(VersionhistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders every release as a list item with a machine-readable date', () => {
    expect(fixture.nativeElement.querySelectorAll('.versions__item').length).toBe(5);

    const dates: (string | null)[] = Array.from(
      fixture.nativeElement.querySelectorAll('.versions__item time') as NodeListOf<HTMLTimeElement>
    ).map(time => time.getAttribute('datetime'));

    // Newest first. This assertion is deliberately exact: it is what caught the
    // 2.5.0 entry being added, and it will catch the next one too.
    expect(dates).toEqual(['2026-08-04', '2025-08-27', '2022-10-01', '2021-10-21', '2021-10-08']);
  });
});
