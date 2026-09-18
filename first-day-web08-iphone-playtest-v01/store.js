export function validateRecord(record) {
  if(!record || record.format!==1 || !Number.isInteger(record.revision) || record.revision<0)throw new Error("지원하지 않는 기록입니다. 원본을 보존했습니다.");
  if(record.json===null){if(record.revision!==0)throw new Error("저장 내용이 비어 있습니다. 원본을 보존했습니다.");return;}
  const s=JSON.parse(record.json);
  if(!s||!Number.isInteger(s.schemaVersion)||s.schemaVersion<1||s.schemaVersion>6)throw new Error("지원하지 않는 저장 버전입니다. 최신 검토 링크로 열어 주세요.");
  if(typeof s.openingSeen!=="boolean"||typeof s.firstLightCompleted!=="boolean"||!Array.isArray(s.bagSlots)||s.bagSlots.length!==4||!s.district||!s.chapter||!s.shores||!s.exteriorPlayerPosition)throw new Error("저장 내용을 온전히 읽을 수 없습니다. 자동으로 새 세계를 만들지 않고 기록을 보존했습니다.");
  if(s.firstDay){const f=s.firstDay;if(!Number.isInteger(f.version)||f.version<0||f.version>1||!Array.isArray(f.identities)||f.identities.some(i=>!i||typeof i.actor!=="string"||!i.actor||!["male-buzz-v1","female-bob-v1"].includes(i.baseId))||new Set(f.identities.map(i=>i.actor)).size!==f.identities.length||!Number.isFinite(f.latchSlide)||!Array.isArray(f.workshopContents)||f.workshopContents.length!==2||!Array.isArray(f.homeShelfContents)||f.homeShelfContents.length!==2)throw new Error("이 첫날 기록은 현재 버전에서 읽을 수 없습니다. 원본을 보존했습니다.");}
}
// Stable per-origin database. Build paths, query strings and asset hashes never enter its name.
export class ReviewStore {
  constructor(name = "Bloomtide.Cove.Review.V01") { this.name = name; this.db = null; }
  async open() {
    this.db = await new Promise((resolve,reject) => {
      const r = indexedDB.open(this.name,1);
      r.onupgradeneeded = () => r.result.createObjectStore("slots",{keyPath:"id"});
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("저장 공간이 다른 창에서 사용 중입니다."));
    });
    this.db.onversionchange = () => this.db.close();
    // Fail before gameplay if writes cannot commit. The probe is removed in the same transaction.
    await this.transaction("readwrite",s => { s.put({id:"storage-probe"}); s.delete("storage-probe"); });
  }
  transaction(mode,action) {
    return new Promise((resolve,reject) => {
      let tx, request, value;
      try {
        tx = this.db.transaction("slots",mode);
        request = action(tx.objectStore("slots"));
        if (request) request.onsuccess = () => { value=request.result; };
        // An individual request succeeding is not a committed save.
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || new Error("저장 작업이 취소됐습니다."));
        tx.onerror = () => {}; // onabort owns failure; no false success on request success.
      } catch(e) { reject(e); }
    });
  }
  async list() { return (await this.transaction("readonly",s=>s.getAll())).filter(r=>r.id!=="storage-probe"); }
  get(id) { return this.transaction("readonly",s=>s.get(id)); }
  async create() {
    const record={id:"review-"+crypto.randomUUID(),created:Date.now(),updated:Date.now(),revision:0,json:null,format:1};
    await this.transaction("readwrite",s=>s.add(record)); return record;
  }
  async save(record,json) {
    // Compare within the same atomic transaction, even though the page also holds a Web Lock.
    const next={...record,json,revision:record.revision+1,updated:Date.now()};
    await new Promise((resolve,reject)=>{
      const tx=this.db.transaction("slots","readwrite"),s=tx.objectStore("slots"),r=s.get(record.id);
      let conflict=false;
      r.onsuccess=()=>{const old=r.result;if(!old||old.format!==1||old.revision!==record.revision){conflict=true;tx.abort();return;}
        // One immutable pre-upgrade copy inside the same atomic record transaction.
        // Slot identity and contents survive; no database reset or replacement slot.
        try { if(old.json&&!old.preFirstDayJson&&JSON.parse(old.json).schemaVersion<6&&JSON.parse(json).schemaVersion===6)next.preFirstDayJson=old.json; }
        catch { /* Storage transaction tests also exercise opaque bytes; gameplay validates before entry. */ }
        if(old.preFirstDayJson)next.preFirstDayJson=old.preFirstDayJson;
        s.put(next);};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(conflict?new Error("다른 기록 변경을 감지했습니다. 새로 열어 주세요."):tx.error||new Error("저장 실패"));tx.onerror=()=>{};
    }); return next;
  }
}
