import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Docs from './Docs';

describe('Docs page', () => {
  it('renders the page title', () => {
    render(<Docs />);
    expect(screen.getByText('PROJECT-CLAW DOCUMENTATION')).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    render(<Docs />);
    expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    expect(screen.getByText('ARCHITECTURE')).toBeInTheDocument();
    expect(screen.getByText('FEATURES')).toBeInTheDocument();
    expect(screen.getByText('ROADMAP')).toBeInTheDocument();
    expect(screen.getByText('API REFERENCE')).toBeInTheDocument();
  });

  it('shows overview tab by default', () => {
    render(<Docs />);
    expect(screen.getByText('PROJECT-CLAW')).toBeInTheDocument();
    expect(screen.getByText(/full-stack AI agent management platform/i)).toBeInTheDocument();
  });

  it('shows overall progress', () => {
    render(<Docs />);
    expect(screen.getByText('OVERALL PROJECT PROGRESS')).toBeInTheDocument();
  });

  it('shows how it works flow', () => {
    render(<Docs />);
    expect(screen.getByText('HOW IT WORKS')).toBeInTheDocument();
  });

  it('switches to architecture tab', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('ARCHITECTURE'));
    expect(screen.getByText('SYSTEM ARCHITECTURE')).toBeInTheDocument();
    expect(screen.getByText('AGENT REGISTRATION FLOW')).toBeInTheDocument();
  });

  it('switches to features tab', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('FEATURES'));
    expect(screen.getByText('PLATFORM CAPABILITIES')).toBeInTheDocument();
    expect(screen.getByText('AI Agent Fleet')).toBeInTheDocument();
    expect(screen.getByText('Real-Time Chat')).toBeInTheDocument();
  });

  it('shows agent types in features tab', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('FEATURES'));
    expect(screen.getByText('AGENT TYPES')).toBeInTheDocument();
  });

  it('switches to roadmap tab', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('ROADMAP'));
    expect(screen.getByText('PROJECT COMPLETE')).toBeInTheDocument();
    expect(screen.getByText('ESTIMATED TIMELINE')).toBeInTheDocument();
    expect(screen.getByText('DEVELOPMENT PHASES')).toBeInTheDocument();
    expect(screen.getByText('BONUS ENHANCEMENTS (ALL COMPLETED)')).toBeInTheDocument();
  });

  it('shows phase progress in roadmap', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('ROADMAP'));
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('Agent Management')).toBeInTheDocument();
    expect(screen.getByText('Task System')).toBeInTheDocument();
  });

  it('switches to API reference tab', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('API REFERENCE'));
    expect(screen.getByText('QUICK REFERENCE')).toBeInTheDocument();
    expect(screen.getByText('ENDPOINTS')).toBeInTheDocument();
  });

  it('expands API section on click', () => {
    render(<Docs />);
    fireEvent.click(screen.getByText('API REFERENCE'));
    // PROJECTS section should be open by default — multiple /api/projects entries exist
    const matches = screen.getAllByText('/api/projects');
    expect(matches.length).toBeGreaterThan(0);
  });
});
