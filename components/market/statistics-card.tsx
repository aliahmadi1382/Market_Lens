// Adapted from AdminCN 1.0.0 statistics-card-01.tsx (MIT, shadcn/studio).
// Original license: vendor/admincn/LICENSE.md.
import type {ReactNode} from 'react';
import {Card,CardContent,CardHeader} from '@/components/ui/card';

export function StatisticsCard({icon,value,title,description,className=''}:{icon:ReactNode;value:string|number;title:string;description:string;className?:string}){
 return <Card className={`stat ${className}`}>
  <CardHeader className="stat-header">
   <span className="stat-icon" aria-hidden="true">{icon}</span>
   <span className="stat-value" data-long={String(value).length>12}>{value}</span>
  </CardHeader>
  <CardContent className="stat-content">
   <h2 className="stat-label">{title}</h2>
   <p className="stat-sub">{description}</p>
  </CardContent>
 </Card>;
}
