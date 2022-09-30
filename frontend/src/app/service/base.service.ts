import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class BaseService <
T extends { _id: string | number; [key: string]: any }
> {
apiUrl: string = environment.apiUrl;
entity: string = '';
list$: BehaviorSubject<T[]> = new BehaviorSubject<T[]>([]);

constructor(private http: HttpClient, public config: ConfigService) {}

getAll(): Observable<T[]> {
  return this.http.get<T[]>(`${this.apiUrl}/${this.entity}`);
}


getOne(_id: string | number): Observable<T> {
  return this.http.get<T>(`${this.apiUrl}/${this.entity}/${_id}`);
}

create(entity: T): Observable<T> {
  const newEntity = { ...entity, _id: null };
  return this.http.post<T>(`${this.apiUrl}/${this.entity}`, newEntity);
}

update(entity: T): Observable<T> {
  return this.http.patch<T>(
    `${this.apiUrl}/${this.entity}/${entity._id}`,
    entity
  );
}

delete(entity: T): Observable<T> {
  return this.http.delete<T>(`${this.apiUrl}/${this.entity}/${entity._id}`);
}
}