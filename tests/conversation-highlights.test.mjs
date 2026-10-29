import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationSegments } from '../src/lib/studio/conversation-highlights.ts';

test('highlights multi-word layer tags and agent mentions without changing message text', () => {
 const text = '#Bottom navigation fix the double icons here, @Noor and @Mira. #other';
 const segments = conversationSegments(text, ['Bottom', 'Bottom navigation']);
 assert.equal(segments.map(segment => segment.text).join(''), text);
 assert.deepEqual(segments.filter(segment => segment.kind !== 'text').map(({text,kind,role}) => ({text,kind,role})), [
  {text:'#Bottom navigation',kind:'layer',role:undefined},
  {text:'@Noor',kind:'agent',role:'ux_architect'},
  {text:'@Mira',kind:'agent',role:'ui_designer'},
  {text:'#other',kind:'layer',role:undefined},
 ]);
});

test('does not highlight mentions embedded in words or email addresses', () => {
 const text = 'email@Mira.com and @Noorish';
 assert.deepEqual(conversationSegments(text, []), [{text,kind:'text'}]);
});
