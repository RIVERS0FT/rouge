/** Edmonds' unweighted blossom algorithm. One vertex is one indivisible starting
 * management region; a matched edge is a legal, equal-resource two-region start.
 * Maximum cardinality keeps the map's actual capacity, not a guessed seat limit. */
export function maximumMatching(graph:readonly (readonly number[])[]):number[]{
 const n=graph.length,match=new Array<number>(n).fill(-1),parent=new Array<number>(n),base=new Array<number>(n);
 const used=new Array<boolean>(n),blossom=new Array<boolean>(n);
 function ancestor(a:number,b:number):number{
  const path=new Set<number>();
  for(;;){a=base[a];path.add(a);if(match[a]===-1)break;a=parent[match[a]];}
  for(;;){b=base[b];if(path.has(b))return b;b=parent[match[b]];}
 }
 function mark(v:number,b:number,child:number){
  while(base[v]!==b){blossom[base[v]]=blossom[base[match[v]]]=true;parent[v]=child;child=match[v];v=parent[match[v]];}
 }
 function augment(root:number):boolean{
  used.fill(false);parent.fill(-1);for(let i=0;i<n;i++)base[i]=i;
  const queue=[root];used[root]=true;
  for(let head=0;head<queue.length;head++){
   const v=queue[head];
   for(let u of graph[v]){
    if(base[v]===base[u]||match[v]===u)continue;
    if(u===root||(match[u]!==-1&&parent[match[u]]!==-1)){
     const b=ancestor(v,u);blossom.fill(false);mark(v,b,u);mark(u,b,v);
     for(let i=0;i<n;i++)if(blossom[base[i]]){base[i]=b;if(!used[i]){used[i]=true;queue.push(i);}}
    }else if(parent[u]===-1){
     parent[u]=v;
     if(match[u]===-1){while(u!==-1){const p=parent[u],next=p===-1?-1:match[p];match[u]=p;if(p!==-1)match[p]=u;u=next;}return true;}
     u=match[u];used[u]=true;queue.push(u);
    }
   }
  }
  return false;
 }
 for(let v=0;v<n;v++)if(match[v]===-1)augment(v);
 return match;
}
