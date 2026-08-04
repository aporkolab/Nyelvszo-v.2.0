import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { PrefaceComponent } from './preface.component';

describe('PrefaceComponent', () => {
  let component: PrefaceComponent;
  let fixture: ComponentFixture<PrefaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrefaceComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(PrefaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the body inside a prose block', () => {
    expect(fixture.nativeElement.querySelector('.prose')).not.toBeNull();
  });

  it('keeps the heading levels sequential', () => {
    const levels: number[] = Array.from(
      fixture.nativeElement.querySelectorAll('h1, h2, h3, h4') as NodeListOf<HTMLElement>
    ).map(heading => Number(heading.tagName.substring(1)));

    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => {
      if (index > 0) {
        expect(level - levels[index - 1]).toBeLessThanOrEqual(1);
      }
    });
  });
});
