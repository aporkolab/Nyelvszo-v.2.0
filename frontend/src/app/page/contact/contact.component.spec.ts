import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ContactComponent } from './contact.component';

describe('ContactComponent', () => {
  let component: ContactComponent;
  let fixture: ComponentFixture<ContactComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes every address as a real mailto link', () => {
    const addresses: (string | null)[] = Array.from(
      fixture.nativeElement.querySelectorAll('a.contact-mail') as NodeListOf<HTMLAnchorElement>
    ).map(link => link.getAttribute('href'));

    expect(addresses).toEqual([
      'mailto:adam@porkolab.hu',
      'mailto:fekete.tamas@pte.hu',
      'mailto:adam@porkolab.hu',
    ]);
  });

  it('hides the decorative mail icons from assistive technology', () => {
    const icons: Element[] = Array.from(
      fixture.nativeElement.querySelectorAll('a.contact-mail i-feather') as NodeListOf<Element>
    );

    expect(icons.length).toBe(3);
    icons.forEach(icon => expect(icon.getAttribute('aria-hidden')).toBe('true'));
  });
});
