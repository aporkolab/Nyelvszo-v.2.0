import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-forbidden',
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './forbidden.component.html',
})
export class ForbiddenComponent implements OnInit {
  constructor() {}

  ngOnInit(): void {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('load', this.reconnect);
    }
  }

  private reconnect() {
    const first = document.querySelector('.first') as HTMLDivElement | null;
    const second = document.querySelector('.second') as HTMLDivElement | null;
    const third = document.querySelector('.third') as HTMLDivElement | null;
    const container = document.querySelector('.container') as HTMLDivElement | null;
    const redirect = document.querySelector('.redirect') as HTMLDivElement | null;

    setTimeout(() => {
      first?.classList.toggle('num-four');
      second?.classList.toggle('num-zero');
      third?.classList.toggle('num-three');
      container?.classList.toggle('_403');
      redirect?.classList.toggle('visible');
    }, 1500);
  }
}
