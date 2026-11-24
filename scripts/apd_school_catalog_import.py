"""DGCyE public CSV -> minimal school index, offline/read-only candidate.
Catalog update date is not the legal effective date of a salary supplement.
No teacher data; no contacts, enrolment or coordinates copied.
"""
import argparse, csv, datetime, hashlib, io, json, pathlib, re, unicodedata
from collections import Counter
DATASET="4becb4b7-0a21-4fef-8f2c-30df7f345a01"
KEY=re.compile(r"[0-9]{4}[A-Z]{2}[0-9]{4}")
MAX_BYTES=80*1024*1024
def norm(s):
    return "".join(c for c in unicodedata.normalize("NFKD",s.strip().lower()) if not unicodedata.combining(c))
def field(s, maxlen=180):
    s=(s or "").strip()
    if not s or norm(s) in {"null","none","nan","n/a","s/d","sin datos","-"}:
        return None
    if len(s)>maxlen or any(ord(c)<32 for c in s) or "<" in s or ">" in s:
        raise ValueError("Invalid text field")
    return s
def compile_index(raw, *, resource_id, catalog_modified):
    if not raw or len(raw)>MAX_BYTES:
        raise ValueError("CSV size invalid")
    if not re.fullmatch(r"[0-9a-f-]{36}",resource_id):
        raise ValueError("Resource identifier invalid")
    datetime.date.fromisoformat(catalog_modified)
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline=""),strict=True)
    headers=[norm(x) for x in (reader.fieldnames or [])]
    required={"clave","establecimiento_nombre","nivel","desfavorabilidad","ambito","periodo"}
    if len(headers)!=len(set(headers)) or not required.issubset(headers):
        raise ValueError("Unexpected official CSV schema")
    municipality=next((k for k in ("municipio_nombre","munipio_nombre") if k in headers),None)
    if not municipality:
        raise ValueError("Missing municipality column")
    out={}; ambiguous=set(); counts=Counter()
    for row in reader:
        if None in row or any(v is None for v in row.values()):
            raise ValueError("Malformed CSV row")
        d={norm(k):v for k,v in row.items()}
        k=d["clave"].strip().upper()
        counts["source_rows"]+=1
        if not KEY.fullmatch(k):
            counts["invalid_key"]+=1;continue
        item={"schoolKey":k,"name":field(d["establecimiento_nombre"]),"district":field(d[municipality]),"level":field(d["nivel"]),"area":field(d["ambito"]),"classification":field(d["desfavorabilidad"],60),"surveyPeriod":field(d["periodo"],100)}
        if not item["name"] or not item["district"]:
            counts["incomplete_identity"]+=1
            ambiguous.add(k);out.pop(k,None);continue
        if k in ambiguous:
            continue
        if k in out:
            counts["duplicate_key"]+=1
            if out[k]!=item:
                ambiguous.add(k);out.pop(k,None)
            continue
        out[k]=item
    counts["ambiguous_keys"]=len(ambiguous)
    counts["indexed"]=len(out)
    counts["missing_classification"]=sum(x["classification"] is None for x in out.values())
    if not out:
        raise ValueError("No usable rows")
    return {"schema":1,"source":"DGCYE_PBA","datasetId":DATASET,"resourceId":resource_id,"catalogModified":catalog_modified,"sha256":hashlib.sha256(raw).hexdigest(),"counts":dict(counts),"schools":[out[k] for k in sorted(out)]}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("csv",type=pathlib.Path);p.add_argument("--resource-id",required=True);p.add_argument("--catalog-modified",required=True);p.add_argument("--output",type=pathlib.Path,required=True)
    a=p.parse_args()
    if a.csv.stat().st_size>MAX_BYTES:
        raise ValueError("CSV too large")
    result=compile_index(a.csv.read_bytes(),resource_id=a.resource_id,catalog_modified=a.catalog_modified)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    temp=a.output.with_suffix(".tmp")
    temp.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    temp.replace(a.output)
    print(json.dumps({"sha256":result["sha256"],"counts":result["counts"]}))
if __name__=="__main__":
    main()
