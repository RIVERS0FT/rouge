"""Build geographic region polygons from the pinned 1.13.7 reference.
Raw game files are temporary inputs, never included in runtime/release archives.
The output uses an approximate Miller georeference, not survey coordinates.
Requires: numpy, pillow, rasterio, shapely>=2.1.
"""
from pathlib import Path
import json, re, math, hashlib, urllib.request, io, gzip
import numpy as np
from PIL import Image
from rasterio.features import shapes
from shapely.geometry import shape, Polygon, MultiPolygon, mapping
from shapely import make_valid, coverage_simplify, coverage_is_valid
from shapely.ops import unary_union, polylabel

REV = '5138a546c6607137ed3d7797b0d1154d8006dc5f'
REPO = 'STERILITZIA02/Victoria-3-lite-map-editor'
ROOT = 'tools/vanilla_1_13_7_reference/game/map_data/'
BASE = f'https://raw.githubusercontent.com/{REPO}/{REV}/{ROOT}'
OUT = Path('artifacts/state-reference'); OUT.mkdir(parents=True, exist_ok=True)

def read(url):
    request = urllib.request.Request(url, headers={'User-Agent':'ROUGE-state-map-audit'})
    with urllib.request.urlopen(request, timeout=90) as response: return response.read()

def block_at(text, start):
    begin = text.index('{', start); level = 1; end = begin + 1
    while level:
        if text[end] == '{': level += 1
        elif text[end] == '}': level -= 1
        end += 1
    return text[begin+1:end-1], end

listing = json.loads(read(f'https://api.github.com/repos/{REPO}/contents/{ROOT}state_regions?ref={REV}'))
regions=[]; source_hashes={}
for entry in sorted(listing, key=lambda item:item['name']):
    if not entry['name'].endswith('.txt'): continue
    raw=read(BASE+'state_regions/'+entry['name']); source_hashes[entry['name']]=hashlib.sha256(raw).hexdigest()
    text=re.sub(r'#.*', '', raw.decode('utf-8-sig')); offset=0
    while match:=re.search(r'\b(STATE_[A-Z0-9_]+)\s*=\s*\{',text[offset:]):
        start=offset+match.start(); body,offset=block_at(text,start)
        province_match=re.search(r'\bprovinces\s*=\s*\{([^}]+)\}',body)
        if not province_match: continue
        source_id=int(re.search(r'\bid\s*=\s*(\d+)',body).group(1))
        colors=[int(value,16) for value in re.findall(r'"x([0-9A-Fa-f]{6})"',province_match.group(1))]
        regions.append({'code':match.group(1),'sourceId':source_id,'colors':colors})
regions.sort(key=lambda r:r['sourceId'])
assert len({r['code'] for r in regions})==len(regions)
assert len({r['sourceId'] for r in regions})==len(regions)
raw=read(BASE+'provinces.png'); source_hashes['provinces.png']=hashlib.sha256(raw).hexdigest()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='8c201266a4964a9ca348e6ea39aab9a490cb21c5'
image=np.asarray(Image.open(io.BytesIO(raw)).convert('RGB'),dtype=np.uint32)
height,width=image.shape[:2]; assert (width,height)==(8192,3616),(width,height)
codes=(image[:,:,0]<<16)|(image[:,:,1]<<8)|image[:,:,2]; del image
lut=np.zeros(1<<24,dtype=np.int32)
for i,region in enumerate(regions,1):
    for color in region['colors']:
        assert lut[color]==0, ('duplicate province membership',region['code'],color)
        lut[color]=i
labels=lut[codes]; del lut,codes
neighbors=[set() for _ in regions]
for a,b in [(labels[:,:-1],labels[:,1:]),(labels[:-1,:],labels[1:,:])]:
    valid=(a!=b)&(a>0)&(b>0)
    pairs=np.unique(np.sort(np.stack((a[valid],b[valid]),axis=1),axis=1),axis=0)
    for x,y in pairs: neighbors[x-1].add(int(y-1)); neighbors[y-1].add(int(x-1))
parts=[[] for _ in regions]
for geometry,value in shapes(labels,mask=labels>0,connectivity=4):
    parts[int(value)-1].append(shape(geometry))

def polygons(g):
    if g.geom_type=='Polygon': return [g] if not g.is_empty else []
    return [p for item in getattr(g,'geoms',[]) for p in polygons(item)]

geometries=[]
for i,items in enumerate(parts):
    assert items, ('missing geometry',regions[i]['code'])
    clean=polygons(make_valid(unary_union(items)))
    geometries.append(MultiPolygon(clean))
del parts,labels
valid_before=bool(coverage_is_valid(geometries))
if valid_before:
    simplified=list(coverage_simplify(geometries,tolerance=0.65,simplify_boundary=True))
    assert coverage_is_valid(simplified)
else:
    # Exact raster vertices remain watertight even if one source polygon is invalid.
    # Do not independently simplify neighboring regions and manufacture cracks.
    simplified=geometries
rad=math.pi/180; top=-math.asinh(math.tan(.8*74*rad))/(.8*rad)*10; scale=3600/width

def coordinate(x,y):
    z=top+y*scale
    return [round(x/width*360-180,7),round(math.atan(math.sinh(-z*rad*.8/10))/(.8*rad),7)]

# Names of geographic places, not country membership. Unknown translations retain
# a readable English label. The project can expand this independent dictionary.
zh={'HOME_COUNTIES':'本土诸郡','LANCASHIRE':'兰开夏','YORKSHIRE':'约克郡','MIDLANDS':'中部地区','EAST_ANGLIA':'东盎格利亚','WEST_COUNTRY':'西部地区','HIGHLANDS':'高地','LOWLANDS':'低地','WALES':'威尔士','ULSTER':'阿尔斯特','MUNSTER':'芒斯特','LEINSTER':'伦斯特','CONNAUGHT':'康诺特','BRANDENBURG':'勃兰登堡','SAXONY':'萨克森','BAVARIA':'巴伐利亚','FRANCONIA':'弗兰肯','SILESIA':'西里西亚','BOHEMIA':'波希米亚','MORAVIA':'摩拉维亚','AUSTRIA':'奥地利','TYROL':'蒂罗尔','HESSE':'黑森','WURTTEMBERG':'符腾堡','BADEN':'巴登','WESTPHALIA':'威斯特法伦','RHINELAND':'莱茵兰','NORTH_RHINE':'北莱茵','SOUTH_RHINE':'南莱茵','ALSACE_LORRAINE':'阿尔萨斯-洛林','ILE_DE_FRANCE':'法兰西岛','NORMANDY':'诺曼底','BRITTANY':'布列塔尼','PICARDY':'皮卡第','PROVENCE':'普罗旺斯','LANGUEDOC':'朗格多克','BURGUNDY':'勃艮第','CHAMPAGNE':'香槟','RHONE':'罗讷','WARSAW':'华沙','GREATER_POLAND':'大波兰','LESSER_POLAND':'小波兰','EAST_PRUSSIA':'东普鲁士','WEST_PRUSSIA':'西普鲁士','POMERANIA':'波美拉尼亚','NEW_YORK':'纽约','CALIFORNIA':'加利福尼亚','TEXAS':'得克萨斯','OHIO':'俄亥俄','FLORIDA':'佛罗里达','ONTARIO':'安大略','QUEBEC':'魁北克','ALASKA':'阿拉斯加','GREENLAND':'格陵兰','ICELAND':'冰岛','BEIJING':'北京','HEBEI':'河北','SHANXI':'山西','SHANDONG':'山东','HENAN':'河南','SHAANXI':'陕西','GANSU':'甘肃','QINGHAI':'青海','TIBET':'西藏','NINGXIA':'宁夏','JIANGSU':'江苏','NANJING':'南京','ANHUI':'安徽','HENAN':'河南','HUBEI':'湖北','HUNAN':'湖南','JIANGXI':'江西','ZHEJIANG':'浙江','FUJIAN':'福建','GUANGDONG':'广东','GUANGXI':'广西','YUNNAN':'云南','GUIZHOU':'贵州','SICHUAN':'四川','CHONGQING':'重庆','SHENGJING':'盛京','JILIN':'吉林','HEILONGJIANG':'黑龙江','INNER_MONGOLIA':'内蒙古','OUTER_MONGOLIA':'外蒙古','TAIWAN':'台湾','HOKKAIDO':'北海道','TOHOKU':'东北','KANTO':'关东','CHUBU':'中部','KANSAI':'关西','CHUGOKU':'中国地方','SHIKOKU':'四国','KYUSHU':'九州','RYUKYU_ISLANDS':'琉球群岛','SEOUL':'首尔','PYONGYANG':'平壤','SVEALAND':'斯韦阿兰','GOTALAND':'约塔兰','SCANIA':'斯堪尼亚','NORRLAND':'诺尔兰','GOTLAND':'哥特兰','JUTLAND':'日德兰','ZEALAND':'西兰','WESTERN_NORWAY':'西挪威','NORTHERN_NORWAY':'北挪威','EASTERN_NORWAY':'东挪威','SOUTHERN_NORWAY':'南挪威','MOSCOW':'莫斯科','INGRIA':'英格里亚','KIEV':'基辅','CRIMEA':'克里米亚','NEW_SOUTH_WALES':'新南威尔士','VICTORIA':'维多利亚','QUEENSLAND':'昆士兰','WESTERN_AUSTRALIA':'西澳大利亚','SOUTH_AUSTRALIA':'南澳大利亚','TASMANIA':'塔斯马尼亚','NORTH_ISLAND':'北岛','SOUTH_ISLAND':'南岛','LOMBARDY':'伦巴第','PIEDMONT':'皮埃蒙特','TUSCANY':'托斯卡纳','LAZIO':'拉齐奥','SICILY':'西西里','SARDINIA':'撒丁','CORSICA':'科西嘉','CATALONIA':'加泰罗尼亚','ANDALUSIA':'安达卢西亚','GALICIA':'加利西亚','BENGAL':'孟加拉','PUNJAB':'旁遮普','DELHI':'德里','BOMBAY':'孟买','MADRAS':'马德拉斯','CEYLON':'锡兰','JAVA':'爪哇','SUMATRA':'苏门答腊','BORNEO':'婆罗洲','LUXEMBOURG':'卢森堡','HOLLAND':'荷兰地区','FRIESLAND':'弗里斯兰','WALLONIA':'瓦隆','FLANDERS':'佛兰德','ZURICH':'苏黎世','WEST_SWITZERLAND':'西瑞士','EAST_SWITZERLAND':'东瑞士'}
provinces=[]; vertex_count=0
for i,(region,g) in enumerate(zip(regions,simplified)):
    components=sorted(polygons(g),key=lambda poly:poly.area,reverse=True)
    geometry=[]
    for poly in components:
        rings=[poly.exterior,*poly.interiors]
        converted=[[coordinate(x,y) for x,y in ring.coords] for ring in rings]
        vertex_count+=sum(map(len,converted)); geometry.append(converted)
    anchor=polylabel(components[0],tolerance=0.5)
    short=region['code'][6:]; english=short.replace('_',' ').title()
    provinces.append({'code':region['code'],'sourceId':region['sourceId'],'name':[zh.get(short,english),english],
        'center':coordinate(anchor.x,anchor.y),'neighbors':sorted(neighbors[i]),'geometry':geometry})
result={'format':3,'source':'Victoria 3 state-region reference (geographic boundary conversion only)',
 'sourceRepository':REPO,'sourceRevision':REV,'sourceVersion':'1.13.7','coordinateSystem':'OGC:CRS84',
 'georeference':'Approximate Miller placement: 74N, 16384:7232. No claim of official coordinates.',
 'provinces':provinces}
encoded=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode()
(OUT/'world.json').write_bytes(encoded)
(OUT/'state-atlas.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
(OUT/'audit.json').write_text(json.dumps({'regions':len(regions),'vertices':vertex_count,'rasterSize':[width,height],
 'coverageValid':valid_before,'outputSha256':hashlib.sha256(encoded).hexdigest(),'sourceHashes':source_hashes,
 'sourceVersion':'1.13.7','sourceRevision':REV,'untranslated':sum(p['name'][0]==p['name'][1] for p in provinces)},indent=2))
(OUT/'regions.txt').write_text('\n'.join(f"{i}\t{p['sourceId']}\t{p['code']}\t{p['name'][0]}\t{len(p['neighbors'])}" for i,p in enumerate(provinces)))
print(json.dumps({'regions':len(regions),'vertices':vertex_count,'bytes':len(encoded),'coverageValid':valid_before}))
