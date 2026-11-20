declare module 'libtess' {
 type Vertex=[number,number,number];
 class GluTesselator {
  gluTessNormal(x:number,y:number,z:number):void;
  gluTessProperty(property:number,value:number):void;
  gluTessCallback(which:number,callback:(vertex:Vertex)=>void|Vertex):void;
  gluTessBeginPolygon(data:null):void;
  gluTessBeginContour():void;
  gluTessVertex(coords:Vertex,data:Vertex):void;
  gluTessEndContour():void;
  gluTessEndPolygon():void;
 }
 const libtess:{GluTesselator:typeof GluTesselator;gluEnum:Record<string,number>;windingRule:Record<string,number>};
 export default libtess;
}
