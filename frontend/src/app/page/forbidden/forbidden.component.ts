import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

let first = document.querySelector('.first') as HTMLDivElement | null;
let second = document.querySelector('.second') as HTMLDivElement | null;
let third = document.querySelector('.third') as HTMLDivElement | null;
let container = document.querySelector('.container') as HTMLDivElement | null;
let redirect = document.querySelector('.redirect') as HTMLDivElement | null;
@Component({
  standalone: true,
  selector: 'app-forbidden',
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './forbidden.component.html',
})
export class ForbiddenComponent implements OnInit {
  constructor() {  

  }
  
  ngOnInit(): void {
    
        window.addEventListener('load', reconnect);
  }

}

function reconnect() {

		setTimeout(() => {
			first!.classList.toggle('num-four');
			second!.classList.toggle('num-zero');
			third!.classList.toggle('num-three');
			container!.classList.toggle('_403');
			redirect!.classList.toggle('visible');
		}, 1500);

  }

