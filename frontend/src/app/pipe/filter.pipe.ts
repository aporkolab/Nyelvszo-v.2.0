import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter',
})
export class FilterPipe<T extends { [key: string]: any }> implements PipeTransform {
  transform(value: T[] | null, phrase: string = '', key: string = ''): T[] | null {
    if (!Array.isArray(value) || !phrase) {
      return value;
    }
    phrase = phrase.toLowerCase();

    if (!key) {
      return value.filter(item => {
        return valuesToString(item).includes(phrase);
      });
    }

    return value.filter(item => {
      return String(item[key]).toLowerCase().includes(phrase);
    });

    function valuesToString(item: T): string {
      const values = [];
      for (let key in item) {
        values.push(item[key]);
      }
      return values.join(' ').toLowerCase();
    }
  }
}
