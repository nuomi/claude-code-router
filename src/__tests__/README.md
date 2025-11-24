# ICCR Testing Guide

## Overview

This directory contains comprehensive unit tests for the Intelligent Claude Code Router (ICCR) components.

## Test Structure

```
src/
├── semantic/
│   └── __tests__/
│       ├── llm-classifier.test.ts      # LLM classification tests
│       └── model-selector.test.ts      # Model selection tests
├── learning/
│   └── __tests__/
│       └── profile-learner.test.ts     # Profile learning tests
└── __tests__/
    └── setup.ts                        # Test setup and utilities
```

## Running Tests

### Install Dependencies

```bash
npm install --save-dev jest ts-jest @types/jest @jest/globals
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test llm-classifier
npm test model-selector
npm test profile-learner
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Watch Mode

```bash
npm test -- --watch
```

## Test Coverage

Current coverage targets:
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

## Test Categories

### 1. LLM Classifier Tests (`llm-classifier.test.ts`)

Tests for request classification:
- ✅ Constructor with different providers
- ✅ Classification accuracy for different intents
- ✅ Complexity estimation
- ✅ Error handling (invalid JSON, API errors)
- ✅ Prompt building
- ✅ Response parsing

**Key Test Cases:**
```typescript
// Code generation classification
it('should classify code generation request', async () => {
  const result = await classifier.classify('Create a REST API');
  expect(result.intent).toBe(IntentType.CODE_GENERATION);
});

// Error handling
it('should handle invalid JSON response', async () => {
  await expect(classifier.classify('test')).rejects.toThrow();
});
```

### 2. Model Selector Tests (`model-selector.test.ts`)

Tests for model selection logic:
- ✅ Weight normalization
- ✅ Model scoring algorithm
- ✅ Cost vs quality trade-offs
- ✅ Reasoning model selection for expert tasks
- ✅ Unknown model handling
- ✅ Alternative suggestions

**Key Test Cases:**
```typescript
// Cost optimization
it('should select cheap model for simple task', async () => {
  const decision = await selector.selectModel(classification, models);
  expect(decision.model).toBe('deepseek-chat');
});

// Quality optimization
it('should prioritize quality when quality weight is high', async () => {
  const decision = await qualitySelector.selectModel(classification, models);
  expect(decision.model).toBe('claude-3.5-sonnet');
});
```

### 3. Profile Learner Tests (`profile-learner.test.ts`)

Tests for learning and profile updates:
- ✅ Default profile creation
- ✅ Exponential moving average updates
- ✅ Success rate tracking
- ✅ Strength/weakness discovery
- ✅ User-configured profile preservation

**Key Test Cases:**
```typescript
// Learning from outcomes
it('should update profile with exponential moving average', async () => {
  await learner.updateProfile(outcome);
  expect(savedProfile.quality_score).toBeCloseTo(0.82, 2);
});

// Strength discovery
it('should add to strengths when success rate > 85%', async () => {
  await learner.updateProfile(outcome);
  expect(savedProfile.strengths).toContain('code_generation');
});
```

## Writing New Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { YourComponent } from '../your-component';

describe('YourComponent', () => {
  let component: YourComponent;
  let mockDependency: jest.Mocked<Dependency>;

  beforeEach(() => {
    mockDependency = {
      method: jest.fn()
    } as any;
    
    component = new YourComponent(mockDependency);
  });

  describe('yourMethod', () => {
    it('should do something', async () => {
      mockDependency.method.mockResolvedValue('result');
      
      const result = await component.yourMethod();
      
      expect(result).toBe('expected');
      expect(mockDependency.method).toHaveBeenCalledWith('args');
    });
  });
});
```

### Best Practices

1. **Arrange-Act-Assert**: Structure tests clearly
2. **Mock External Dependencies**: Use Jest mocks for databases, APIs
3. **Test Edge Cases**: Include error handling, null values, boundary conditions
4. **Descriptive Names**: Use clear, descriptive test names
5. **One Assertion Per Test**: Keep tests focused
6. **Use beforeEach**: Set up common test state

## Mocking Guidelines

### Mock Database

```typescript
const mockDb: jest.Mocked<Database> = {
  getModelProfile: jest.fn(),
  saveModelProfile: jest.fn(),
} as any;
```

### Mock LLM Client

```typescript
const mockLLMClient = {
  generate: jest.fn().mockResolvedValue(JSON.stringify({
    intent: 'code_generation',
    complexity: 'moderate'
  }))
};
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-commit hooks (optional)

## Troubleshooting

### Tests Failing Locally

1. **Clear Jest cache**: `npm test -- --clearCache`
2. **Check Node version**: Requires Node 18+
3. **Reinstall dependencies**: `rm -rf node_modules && npm install`

### Coverage Not Meeting Threshold

1. **Identify uncovered lines**: `npm test -- --coverage --verbose`
2. **Add missing test cases**
3. **Remove dead code**

### Slow Tests

1. **Use test.only**: Focus on specific tests during development
2. **Mock expensive operations**: Database calls, API requests
3. **Parallelize**: Jest runs tests in parallel by default

## Future Test Additions

Planned test coverage:
- [ ] Database integration tests
- [ ] End-to-end routing tests
- [ ] Performance benchmarks
- [ ] CLI command tests
- [ ] Configuration validation tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Questions?** See [Implementation Plan](../docs/implementation_plan.md) or [API Reference](../docs/iccr_api_reference.md)
