"""Read portrait assets and historical character definitions from a local Victoria 3 installation."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import zlib
from collections import defaultdict
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]
TOKEN = re.compile(r'#[^\n]*|"(?:\\.|[^"\\])*"|[{}=]|[^\s#{}="]+')

def definitions(path):
    tokens = [m[0] for m in TOKEN.finditer(path.read_text(encoding='utf-8-sig', errors='replace')) if not m[0].startswith('#')]
    pos = 0
    def parse():
        nonlocal pos
        pairs = []
        while pos < len(tokens):
            key = tokens[pos]; pos += 1
            if key == '}':
                break
            if key == '{':
                pairs.append((None, parse())); continue
            if pos >= len(tokens) or tokens[pos] != '=':
                pairs.append((None, key.strip('"'))); continue
            pos += 1
            if pos >= len(tokens):
                break
            value = tokens[pos]; pos += 1
            pairs.append((key.strip('"'), parse() if value == '{' else value.strip('"')))
        return pairs
    return parse()

def blocks(fields):
    return [(k,v) for k,v in fields if k is not None and isinstance(v,list)]

def val(fields, key, default=''):
    return next((v for k,v in fields if k==key), default)

def strings(fields):
    return {k:v for k,v in fields if k and isinstance(v,str)}

def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')),encoding='utf-8')

def collect(installation):
    game = installation/'game'
    layers = [game, *sorted(p for p in (game/'dlc').glob('*') if p.is_dir())]
    shared = [installation/'jomini',installation/'clausewitz']
    files = set()
    for layer in layers:
        for directory in ('gfx/models/portraits','gfx/portraits','common/genes','common/dna_data','common/ethnicities','common/cultures','common/culture_graphics','common/character_templates','common/history/characters',
                          'gfx/models/military/generals','gfx/models/military/infantry','gfx/models/military/arms','gfx/models/military/cavalry_horses','gfx/models/military/artillery','gfx/models/infrastructure/military'):
            files.update(p for p in (layer/directory).rglob('*') if p.is_file())
        units = layer/'gfx/models/military/units'
        for kind in ('arms','infantry','generals','cavalry','artillery'):
            source = units/f'military_units_{kind}.asset'
            if source.is_file(): files.add(source)
    for base in [*layers,*shared]:
        files.update(p for p in (base/'gfx/FX').rglob('*portrait*') if p.is_file())

    # Attachments are commonly identified by entity or mesh name, not by file
    # path. An equipped map rider can reference several separate .asset files.
    symbols=defaultdict(set)
    by_name=defaultdict(set)
    indexed=set()
    extensions={'.dds','.png','.mesh','.anim','.asset','.shader','.fxh','.fx','.tga'}
    for base in [*layers,*shared]:
        for directory,_,names in os.walk(base/'gfx'):
            parent=Path(directory)
            for name in names:
                p=parent/name
                if p.suffix.lower() not in extensions:continue
                indexed.add(p);by_name[name.lower()].add(p)
                if p.suffix.lower()!='.asset':continue
                for kind,fields in blocks(definitions(p)):
                    if kind in ('pdxmesh','entity'):
                        identifier=val(fields,'name')
                        if identifier:symbols[identifier].add(p)
    pending=list(files)
    reference=re.compile(r'["<]([^"<>\r\n]+\.(?:dds|png|mesh|anim|asset|fxh|shader|fx|tga))[">]',re.I)
    while pending:
        p=pending.pop()
        if p.suffix.lower() not in ('.txt','.asset','.shader','.fxh','.fx'):continue
        content=p.read_text(encoding='utf-8-sig',errors='replace')
        dependencies=set()
        if p.suffix in ('.asset','.txt'):
            for token in TOKEN.finditer(content):
                dependencies.update(symbols.get(token[0].strip('"'),()))
        for ref in set(reference.findall(content)):
            name=Path(ref).name.lower()
            candidates=by_name.get(name)
            if not candidates:continue
            local=Path(os.path.normpath(p.parent/ref))
            if local in indexed:dependencies.add(local)
            else:
                matches={base/ref for base in [*layers,*shared]} & candidates
                dependencies.update(matches or candidates)
        pending.extend(dependencies-files)
        files.update(dependencies)
    return layers,files

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('installation',type=Path)
    parser.add_argument('--output',type=Path,default=ROOT/'artifacts/victoria-3-models/CharacterLibrary')
    args=parser.parse_args(); inst=args.installation.resolve(); out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    rel=lambda p:p.relative_to(inst).as_posix()
    layers,files=collect(inst)
    locales={}
    for lang in ('simp_chinese','english'):
        names={}
        for layer in layers:
            for p in (layer/'localization'/lang).rglob('*.yml'):
                for m in re.finditer(r'^\s*([\w.\'-]+):\d*\s*"([^"\r\n]*)"',p.read_text(encoding='utf-8-sig',errors='replace'),re.M):
                    names[m[1]]=m[2]
        locales[lang]=names
    dna={};templates={};groups={};accessories={};entities={};meshes={};variants={}
    for p in sorted(files):
        path=rel(p); parts=p.parts
        if p.suffix=='.txt' and 'dna_data' in parts:
            for key,fields in blocks(definitions(p)):
                info=val(fields,'portrait_info',[]); encoded=val(fields,'dna')
                if not info and not encoded:continue
                dna[key]={'source':path,'genes':{g:[x for _,x in values] for g,values in blocks(val(info,'genes',[]))}}
                if encoded:dna[key]['encoded']=encoded
        elif p.suffix=='.txt' and 'character_templates' in parts:
            for key,fields in blocks(definitions(p)):
                templates[key]=(p,strings(fields))
        elif p.suffix=='.txt' and 'genes' in parts:
            root_fields=definitions(p)
            for key,fields in blocks(root_fields)+blocks(val(root_fields,'special_genes',[])):
                if key!='accessory_genes':continue
                for slot,opts in blocks(fields):
                    for template,g in blocks(opts):
                        options={}
                        for sex,v in g:
                            if sex in ('male','female','girl','boy'):
                                options[sex]=[(float(w),item) for w,item in v if w and re.fullmatch(r'\d+(?:\.\d+)?',w) and isinstance(item,str)] if isinstance(v,list) else v
                        if options:groups.setdefault(slot,{})[template]=options
        elif p.suffix=='.txt' and 'accessories' in parts:
            for key,v in blocks(definitions(p)):
                accessories[key]={'source':path,'entities':[strings(e) for name,e in blocks(v) if name=='entity']}
        elif p.suffix=='.txt' and 'accessory_variations' in parts:
            for _,v in blocks(definitions(p)):
                name=val(v,'name');pal=val(v,'color_palette',[])
                if name and pal:variants[name]=val(pal,'texture')
        elif p.suffix=='.asset':
            for key,fields in blocks(definitions(p)):
                name=val(fields,'name')
                if name and key=='entity':
                    user=val(val(fields,'game_data',[]),'portrait_entity_user_data',[])
                    acc=val(user,'portrait_accessory',[])
                    entities[name]={'source':path,'mesh':val(fields,'pdxmesh'),'clone':val(fields,'clone'),'variation':val(acc,'variation'),'mask':val(acc,'pattern_mask')}
                if name and key=='pdxmesh' and val(fields,'file'):
                    meshes[name]={'source':path,'file':rel(p.parent/val(fields,'file')),'materials':[strings(v) for k,v in blocks(fields) if k=='meshsettings']}
    people=[]; linked=set()
    def add(key,p,f,dk,orphan=False):
        country=p.stem[8:].upper() if p and p.stem.startswith('country_') else ''
        fn=f.get('first_name','');ln=f.get('last_name','')
        if fn in ('culture','random'):fn=''
        if ln in ('culture','random'):ln=''
        fallback=key.removeprefix('dna_').replace('_',' ').title()
        def label(lang):
            loc=locales[lang]
            words=[loc.get(n, n.replace('_',' ')) for n in (fn,ln) if n]
            if not words:return fallback
            if lang=='simp_chinese' and f.get('culture','') in ('cu:han','cu:manchu','cu:yue','cu:japanese','cu:korean') and len(words)==2:return words[1]+words[0]
            return ('·' if lang=='simp_chinese' else ' ').join(words)
        person={'id':hashlib.sha256(('dna:' if orphan else 'template:').encode()+key.encode()).hexdigest()[:16],'key':key,
                'template':None if orphan else rel(p),'dna':dk or None,'fixed':dk in dna,'zh':label('simp_chinese'),'en':label('english'),
                'country':country,'countryZh':locales['simp_chinese'].get(country,country),'countryEn':locales['english'].get(country,country),
                'female':f.get('female')=='yes' or (orphan and any(str(v).startswith('female_') for g in dna[dk]['genes'].values() for v in g)),'culture':f.get('culture','').removeprefix('cu:'),'birth':f.get('birth_date',''),'age':f.get('age',''),
                'roles':[s for s in ('is_general','is_admiral','ruler','heir','ig_leader','agitator','is_agitator') if f.get(s)=='yes']+([f['role'].removeprefix('character_role_')] if 'role' in f else []),
                'named':bool(fn or ln or dk in dna or orphan),'historical':f.get('historical')=='yes'}
        people.append(person)
    for key,(p,f) in sorted(templates.items()):
        dk=f.get('dna','');dk='' if dk=='random' else dk;linked.add(dk);add(key,p,f,dk)
    for dk in sorted(dna.keys()-linked):add(dk,None,{},dk,True)
    assert len({p['id'] for p in people})==len(people)
    catalog={'schema':1,'people':people,'dna':dna,'accessoryGenes':groups,'accessories':accessories,'entities':entities,'meshes':meshes,'palettes':variants}
    idx=out/'character-catalog.json';write_json(idx,catalog)
    sheet=out/'人物索引.csv'
    with sheet.open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['ROUGE 外观 ID','中文名','英文名','国家或地区','文化','人物键','历史标志','角色标记','固定肖像','DNA 键','DNA 文件','人物模板文件'])
        for p in people:
            dk=p['dna'];writer.writerow([p['id'],p['zh'],p['en'],p['countryZh'],p['culture'],p['key'],int(p['historical']),','.join(p['roles']),'是' if p['fixed'] else ('引用未找到' if dk else '由游戏生成'),dk,dna.get(dk,{}).get('source',''),p['template']])
    print(f'{len(templates)} templates; {len(dna)} DNA; {len(people)} index entries; {sum(p["named"] for p in people)} named; {len(files)} resource files',flush=True)
    archive=out/'Victoria-3-character-assets.zip';tmp=archive.with_suffix('.zip.partial')
    with ZipFile(tmp,'w',compression=ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
        for p in sorted(files):z.write(p,rel(p))
        z.write(idx,idx.name);z.write(sheet,sheet.name)
    with ZipFile(tmp) as z:
        assert len(z.namelist())==len(files)+2 and z.testzip() is None
        for p in files:
            entry=z.getinfo(rel(p))
            if entry.file_size!=p.stat().st_size or entry.CRC!=zlib.crc32(p.read_bytes()):
                raise ValueError(f'Archived data differs from installed file: {rel(p)}')
    tmp.replace(archive);print(f'CRC verified: {archive.stat().st_size:,} bytes',flush=True)

if __name__=='__main__':main()
