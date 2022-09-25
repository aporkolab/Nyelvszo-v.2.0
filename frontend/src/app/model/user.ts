export class User {
	[k: string]: any;
  _id: number | string = '';
  first_name: string = '';
  last_name: string = '';
  email: string = '';
  role: number = 1 | 2 | 3;
  password: string = '';
}
