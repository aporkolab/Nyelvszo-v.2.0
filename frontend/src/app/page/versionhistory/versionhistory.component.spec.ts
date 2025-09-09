import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VersionhistoryComponent } from './versionhistory.component';

describe('VersionhistoryComponent', () => {
  let component: VersionhistoryComponent;
  let fixture: ComponentFixture<VersionhistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VersionhistoryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VersionhistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
