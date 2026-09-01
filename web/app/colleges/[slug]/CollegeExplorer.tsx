'use client';
import { useState } from 'react';
import type { StudentRow } from '@/lib/types';
import { StudentsClient } from './StudentsClient';
import { SubjectExplorer, type SubjectStat } from './SubjectExplorer';

export function CollegeExplorer(props: {
  collegeId: string; semesterId: string; slug: string;
  initial: StudentRow[]; subjectStats: SubjectStat[];
}) {
  const [tab, setTab] = useState<'students' | 'subjects'>('students');
  return (
    <>
      <div className="viewtabs">
        <button className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>Students</button>
        <button className={tab === 'subjects' ? 'on' : ''} onClick={() => setTab('subjects')}>
          By subject <span className="vt-c">{props.subjectStats.length}</span>
        </button>
      </div>
      {tab === 'students'
        ? <StudentsClient collegeId={props.collegeId} semesterId={props.semesterId} slug={props.slug} initial={props.initial} />
        : <SubjectExplorer collegeId={props.collegeId} semesterId={props.semesterId} subjectStats={props.subjectStats} />}
    </>
  );
}
