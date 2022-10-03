# Dokumentáció - NyelvSzó v.2.0.0

## **1. Az alkalmazás célja**
Jelen alkalmazás a **NyelvSzó v.2.0.0** (Angol-magyar **Nyelv**észeti Szak**szó**tár  - családi filmadatbázis), melynek fő célja, hogy a Dr. Porkoláb Ádám és Dr. Fekete Tamás által gyűjtött, nyelvészeti szakkifejezéshalmaz könnyedén kereshetővé és bővíthetővé váljék.

A felhasználók esetében szerepkörök is vannak a profiljukhoz rendelve: a programban - alapesetben - csak a szerzők és az adminisztrátorok rendelkeznek szócikklétrehozási, szerkesztési és -törlési joggal a teljes adatbázisban. A nem bejelentkezett felhasználók is tudnak keresni és információkat megtekinteni.

## **2. Az alkalmazás telepítése**

1. Ha nincs telepítve a Git verziókezelő szoftver, akkor a https://git-scm.com weboldalról töltsük le és telepítsük fel a főoldalon megtalálható változatok közül az operációs rendszerünknek megfelelőt.

2. Ha nincs telepítve a NodeJS futtatókörnyezet, akkor a https://nodejs.org/en/ weboldalról töltsük le és telepítsük fel a főoldalon található, "LTS" megjelölésű változatot.

3. Ha nincs telepítve az Angular keretrendszer a rendszeren, akkor azt a PowerShell-ben kiadott `npm i -g @angular/cli` paranccsal ezt tegyük meg.

4. Ha nincs telepítve a Docker konténerizációs szoftver, akkor a https://docs.docker.com/get-docker/ weboldalról töltsük le és telepítsük fel az operációs rendszerünknek megfelelő változatot.

5. Le kell klónozni az adott GitHub repository tartalmát. Tehát a PowerShell-ben a következő parancsot kell kiadni:

   `git clone https://github.com/APorkolab/Nyelvszo-v.2.0.git`

6. Telepíteni kell az alkalmazás függőségeit:

   - Backend

     - A terminálon be kell lépni a /backend mappába (`cd backend`) és futtatni az `npm i` parancsot.

   - Frontend
     - A terminálon be kell lépni a /frontend mappába és futtatni az `npm i` parancsot.*

7.1. Manuális telepítés esetén:

   - A terminálban ki kell adni az `ng build` parancsot.

   - A /frontend/dist/frontend mappa tartalmát be kell másolni a /backend/public mappába.

   VAGY

7.2. Automatikus telepítés esetén:

   - A terminálon be kell lépni a /backend mappába és futtatni az `npm run build` parancsot.
   - Fontos, hogy csak az egyik módszer szerint kell telepíteni.

## **2. Az alkalmazás konfigurálása**

- A _/frontend/environments_ mappában be kell állítani az API végpont elérési útvonalát:

  - _environment.ts_ állomány: http://127.0.0.1:3000/
  - _environment.prod.ts_ állomány: http://localhost:3000/

## **3. Az alkalmazás indítása**

- Mind a backend, mind a frontend az `npm start` paranccsal indítható.


## **4. A szerepkörök leírása**


|   |Felhasználó   |Szerkesztő   |Adminisztrátor   |
| ------------ | ------------ | ------------ | ------------ |
| Adatbázisban rögzített értékük ("role")  | 1  | 2  |  3 |
| Jogaik                                    | A felhasználói táblázat kivételével mindent megtekinthet, de nem hozhat létre, szerkeszthet vagy törölhet entitásokat.  |  A minden táblázatot megtekinthet, és a felhasználói táblázat kivételével bármelyiket szerkesztheti, létrehozhat vagy törölhet entitásokat. |  Minden táblázatot megtekinthet, és bármely entitást létrehozhat, szerkeszthet vagy törölhet. |

## **4. Kapcsolattartási információ**
##### Webfejlesztés, design: Dr. Porkoláb Ádám
-   **A weboldallal és általános kérdésekkel, észrevételekkel kapcsolatban:**
Dr. Porkoláb Ádám (adam@porkolab.digital)
  
-   **A szótár anyagával és hibajavításokkal kapcsolatban:**
Dr. Fekete Tamás (fekete.tamas@pte.hu)  
  
## **5. Jogi információk**
© Copyright 2021-2023 Dr. Porkoláb Ádám - Dr. Fekete Tamás.  
  
A szótár anyagát és a keresőt a magyar szerzői jog védi, mindkét szellemi termék magánfelhasználása engedélyezett, üzleti célú felhasználása a szerzők engedélyéhez kötött. Továbbértékesítés tilos.
