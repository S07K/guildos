export const fieldNotes = [
  {
    slug: 'creative-brief-for-ai-design', category: 'Creative direction',
    title: 'How to write a creative brief for AI design',
    description: 'A practical guide to giving your AI design team the context it needs to create a useful first draft.',
    intro: 'A useful creative brief gives a team a destination, not just a list of deliverables. The same is true when you work with AI: the quality of the starting context shapes the conversations and drafts that follow.',
    sections: [
      { heading: 'Start with the problem', paragraphs: ['Describe what you are making and why it needs to exist. A landing page, for example, might need to explain a new product to people who have never heard of it. Give the project a concrete goal, such as helping visitors understand the offer and take a next step.', 'Include the context behind the request. What is working today? What is confusing? What decision should the work help someone make? These details give the creative process a reason to make one choice over another.'] },
      { heading: 'Describe the people you want to reach', paragraphs: ['Identify your audience and what they already know. Consider their needs, questions, and likely hesitations. A page for experienced designers may use different language and examples from one introducing a product to first-time founders.', 'Focus on the information that changes the work. A few useful observations about the audience are more valuable than a long demographic profile without a clear connection to the project.'] },
      { heading: 'Give the direction room to breathe', paragraphs: ['Share your brand voice, visual references, and important constraints. Explain what you like about a reference: its calm spacing, clear hierarchy, or conversational tone. Be equally clear about what should be avoided.', 'Close with a specific first task. Ask for a landing page structure, a key user flow, or a visual direction. Review the result against your goal, then add precise feedback so the next revision starts with a stronger brief.'] },
    ],
  },
  {
    slug: 'what-an-ai-design-team-can-make', category: 'AI workflows',
    title: 'What an AI design team can help you make',
    description: 'Explore how creative direction, UX, visual design, and copy can work together around a shared brief.',
    intro: 'Design work is more than a single image. The most useful creative workflows connect the story, the experience, and the visual details around a shared understanding of the problem.',
    sections: [
      { heading: 'Build a creative direction', paragraphs: ['Begin with the audience, the offer, and the feeling you want to create. A creative direction can bring these ideas together into a starting point for the visual language and the words on the page.', 'Use early concepts to compare possibilities and ask better questions. Your knowledge of the product and its customers remains essential when deciding which direction deserves more work.'] },
      { heading: 'Shape the user experience', paragraphs: ['A user journey gives each screen a purpose. Identify where someone starts, what they need to understand, and what they should be able to do next. From there, explore the structure and hierarchy of the experience.', 'AI-generated drafts can help make an abstract flow tangible. Review them for missing steps, confusing labels, and assumptions that need to be tested with real people.'] },
      { heading: 'Bring the details together', paragraphs: ['Visual design and copy should support the same goal. Explore layout, typography, calls to action, and interface language together rather than treating each as an isolated task.', 'A shared brief gives specialists common context. Review the resulting draft on the canvas, provide specific feedback, and keep refining until the work feels coherent and useful.'] },
    ],
  },
  {
    slug: 'reviewing-ai-generated-designs', category: 'Design review',
    title: 'A simple checklist for reviewing AI-generated designs',
    description: 'Review clarity, hierarchy, consistency, and accessibility before sharing your next design draft.',
    intro: 'A first draft is a starting point for better decisions. Before polishing the details, check whether it solves the problem in the brief and makes sense to the people it is intended to serve.',
    sections: [
      { heading: 'Check the message and hierarchy', paragraphs: ['Can a new visitor understand the offer? Is the most important information easy to find? Read the page from top to bottom and look for the moment where someone might become confused or lose their place.', 'Check that the primary action is visible and that its label describes what happens next. Remove competing messages that distract from the main purpose.'] },
      { heading: 'Look for consistency and accessibility', paragraphs: ['Review repeated patterns across the draft: spacing, type, colors, buttons, and labels should feel related. Consistency helps people recognize how an interface works and gives the design a more considered feel.', 'Check text contrast, readable type, descriptive labels, and keyboard access as the design becomes a working interface. Automated checks can help find issues, but they do not replace testing with people.'] },
      { heading: 'Give feedback that moves the work forward', paragraphs: ['Name the problem and the outcome you want. Instead of “make it better,” try “the primary action gets lost; make it easier to find.” Give examples when they clarify your intent, and avoid changing too many unrelated things at once.', 'Return to the original goal after each revision. Keep the decisions that improve the experience and make time to test important assumptions with the people the work is for.'] },
    ],
  },
] as const;
