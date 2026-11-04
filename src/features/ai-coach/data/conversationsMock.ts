import type { Conversation } from '../types/coach';

export const pastConversations: Conversation[] = [
{ id: 'c1', title: 'Morning HRV check', date: '7:12 AM', group: 'Today', preview: 'HRV rose to 68 ms, 12% above your average…', questions: ['Why is my HRV up today?'] },
{ id: 'c2', title: 'Weekend calories', date: 'Wed', group: 'This week', preview: 'Weekend calories averaged 2,780 vs 2,190…', questions: ['Why has my weight stopped changing?'] },
{ id: 'c3', title: 'Resting heart rate rise', date: 'Mon', group: 'This week', preview: 'Rose about 4 bpm between Sep 28 and Oct 2…', questions: ['Why is my resting heart rate increasing?'] },
{ id: 'c4', title: 'September vs August', date: 'Oct 1', group: 'Earlier', preview: 'September beat August on almost every measure…', questions: ['Compare this month with last month'] },
{ id: 'c5', title: 'Protein meal plan', date: 'Sep 28', group: 'Earlier', preview: 'A full day at about 1,930 kcal and 172 g protein…', questions: ['Plan today’s meals with 160g protein under 2200 calories'] },
{ id: 'c6', title: 'Goal timeline', date: 'Sep 21', group: 'Earlier', preview: 'You’d reach 75 kg in about 9 weeks…', questions: ['When will I reach 75 kg?'] }];


export const welcomePrompts = [
{ topic: 'Recovery', questions: ['Why am I feeling tired today?', 'Why is my resting heart rate increasing?'] },
{ topic: 'Training', questions: ['Create a 45-minute fat-loss workout', 'Can I skip today’s workout?'] },
{ topic: 'Nutrition', questions: ['How many calories do I have left today?', 'Can I eat biryani tonight?'] },
{ topic: 'Progress', questions: ['Show my progress since January', 'When will I reach 90 kg if I continue at my current pace?'] }];