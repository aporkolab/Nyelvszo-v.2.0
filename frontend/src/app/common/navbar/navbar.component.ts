import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/service/auth.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  user$ = this.auth.user$;

  rights = '';

  constructor(private auth: AuthService) {}

  ngOnInit(): void {}

  rightsOfAdmin(role: number) {
    switch (role) {
      case 1:
        this.rights = '';
        return (this.rights =
          'You may view all tables except family members, but you may not create, edit or delete any entities.');
      case 2:
        this.rights = '';
        return (this.rights =
          'You may view all tables except family members, and you may edit any of them but you may not create or delete any entities.');
      case 3:
        this.rights = '';
        return (this.rights =
          'You may view all tables, and you may create, edit or delete any entities.');
      default:
        this.rights = '';
        return (this.rights =
          'Invalid role value. The role value can only be 1, 2 or 3.');
    }
  }
}