import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function stub(request: string, exports: unknown) {
  const path = require.resolve(request);
  const entry = new Module(path);
  entry.exports = exports;
  require.cache[path] = entry;
}

const dismissedCalls = { count: 0 };

const host = (tag: string) =>
  React.forwardRef(({ children, ...props }: any, ref: any) =>
    React.createElement(tag, { ...props, ref }, children),
  );

stub('react-native', {
  View: host('div'),
  Text: host('span'),
  Image: host('img'),
  TextInput: React.forwardRef((props: any, ref: any) =>
    React.createElement('input', { ...props, ref }),
  ),
  ScrollView: host('section'),
  Pressable: host('button'),
  ActivityIndicator: host('div'),
  Keyboard: {
    dismiss: () => {
      dismissedCalls.count++;
    },
  },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Platform: { OS: 'android', select: (obj: any) => obj.android ?? obj.default },
});

stub('react-native-keyboard-controller', {
  KeyboardAwareScrollView: host('div'),
  KeyboardStickyView: host('div'),
  KeyboardProvider: host('div'),
});

const reanimatedStub = {
  createAnimatedComponent: (c: any) => c,
  View: host('div'),
  useSharedValue: (val: any) => ({ value: val }),
  useAnimatedStyle: (cb: any) => cb(),
  withSpring: (val: any) => val,
};
(reanimatedStub as any).default = reanimatedStub;
stub('react-native-reanimated', reanimatedStub);

stub('expo-router', {
  router: { push: () => {}, back: () => {} },
  Stack: { Screen: () => null },
});

stub('lucide-react-native', {
  Eye: () => null,
  EyeOff: () => null,
  ArrowLeft: () => null,
});

stub('../src/hooks/use-theme', {
  useTheme: () => ({
    colors: {
      primary: '#00E096',
      primaryLight: '#00E09620',
      background: '#121212',
      backgroundElement: '#1E1E1E',
      backgroundSelected: '#2A2A2A',
      text: '#FFFFFF',
      textSecondary: '#A0A0A0',
      textTertiary: '#707070',
      textInverse: '#000000',
      border: '#333333',
      borderFocused: '#00E096',
      error: '#FF4D4D',
      errorLight: '#FF4D4D20',
    },
    isDark: true,
  }),
});

stub('../src/components/shared/screen-container', {
  ScreenContainer: host('main'),
});

stub('../src/components/shared/header', {
  Header: () => null,
});

stub('../src/features/auth/services/auth-service', {
  AuthService: {
    login: async () => ({}),
    register: async () => ({}),
  },
});

const { Input } = require('../src/components/ui/input');
const { FormInput } = require('../src/components/ui/form-input');
const { TextField } = require('../src/shared/components/ui/TextField');
const { PasswordField } = require('../src/features/auth/components/PasswordField');
const LoginScreen = require('../src/app/(auth)/login').default;
const RegisterScreen = require('../src/app/(auth)/register').default;
const { loginSchema, registerSchema } = require('../src/features/auth/utils/auth-schemas');

describe('FitOnus Auth Keyboard UX Integration', () => {
  describe('1. Input & FormInput Ref Forwarding Support', () => {
    it('Input is a forwardRef component and renders TextInput with passed ref', () => {
      assert.equal(typeof Input, 'object', 'Input must be a React forwardRef object');
      assert.equal(Input.$$typeof, Symbol.for('react.forward_ref'), 'Input.$$typeof must be forward_ref');

      let renderedOutput: any = null;
      const testRef = { current: null };
      function TestInput() {
        renderedOutput = Input.render({ label: 'Test Label', placeholder: 'Enter text', returnKeyType: 'next' }, testRef);
        return renderedOutput;
      }
      renderToStaticMarkup(React.createElement(TestInput));

      assert.notEqual(renderedOutput, null);
      const inputContainer = renderedOutput.props.children[1];
      const textInputElement = inputContainer.props.children[1];
      assert.equal(textInputElement.ref, testRef, 'ref was not passed to the underlying TextInput');
    });

    it('FormInput is a forwardRef component and propagates ref to Input', () => {
      assert.equal(typeof FormInput, 'object', 'FormInput must be a forwardRef object');
      assert.equal(FormInput.$$typeof, Symbol.for('react.forward_ref'), 'FormInput.$$typeof must be forward_ref');

      const testRef = { current: null };
      const mockControl: any = {};
      const formInputEl = React.createElement(FormInput, {
        ref: testRef,
        control: mockControl,
        name: 'testField',
        returnKeyType: 'next',
      });

      const renderedController = FormInput.render(formInputEl.props, testRef);
      assert.equal(typeof renderedController.props.render, 'function', 'Controller must receive a render function');
      assert.equal(renderedController.props.name, 'testField');

      // Execute render prop of Controller
      const controllerRenderResult = renderedController.props.render({
        field: { onChange: () => {}, onBlur: () => {}, value: 'hello' },
        fieldState: { error: undefined },
      });

      assert.equal(controllerRenderResult.ref, testRef, 'Controller render did not forward ref to Input');
    });

    it('TextField and PasswordField support ref forwarding and forward ref to TextInput', () => {
      assert.equal(typeof TextField, 'object', 'TextField must be a forwardRef object');
      assert.equal(TextField.$$typeof, Symbol.for('react.forward_ref'));

      assert.equal(typeof PasswordField, 'object', 'PasswordField must be a forwardRef object');
      assert.equal(PasswordField.$$typeof, Symbol.for('react.forward_ref'));

      const testRef = { current: null };
      let renderedOutput: any = null;
      function TestTextField() {
        renderedOutput = TextField.render({ label: 'First name', placeholder: 'Enter your name' }, testRef);
        return renderedOutput;
      }
      renderToStaticMarkup(React.createElement(TestTextField));

      assert.notEqual(renderedOutput, null);
      const textInput = renderedOutput.props.children[1].props.children[0];
      assert.equal(textInput.ref, testRef, 'TextField must forward ref to TextInput');
      assert.equal(textInput.props.placeholder, 'Enter your name');
    });
  });

  describe('2. Login Screen Native Keyboard Configuration', () => {
    it('renders Login screen successfully with KeyboardAwareScrollView', () => {
      const loginElement = React.createElement(LoginScreen);
      const html = renderToStaticMarkup(loginElement);

      assert.match(html, /Welcome Back/);
      assert.match(html, /Sign in to continue to OnusFit/);
      assert.match(html, /Email/);
      assert.match(html, /Password/);
      assert.match(html, /Forgot Password\?/);
      assert.match(html, /Login/);
    });

    it('Login screen configures Email returnKeyType next and Password returnKeyType done with Keyboard.dismiss', () => {
      let renderedTree: any = null;
      function TestWrapper() {
        renderedTree = LoginScreen();
        return renderedTree;
      }
      renderToStaticMarkup(React.createElement(TestWrapper));

      assert.notEqual(renderedTree, null);
      const keyboardAwareScrollView = Array.isArray(renderedTree.props.children)
        ? renderedTree.props.children[0]
        : renderedTree.props.children;
      const stickyFooterView = Array.isArray(renderedTree.props.children)
        ? renderedTree.props.children[1]
        : null;

      assert.equal(keyboardAwareScrollView.props.bottomOffset, 88);
      assert.equal(keyboardAwareScrollView.props.keyboardShouldPersistTaps, 'handled');
      assert.notEqual(stickyFooterView, null, 'Login sticky button view must be present');

      const stickyButton = stickyFooterView.props.children;
      assert.equal(stickyButton.props.title, 'Login');

      const formView = keyboardAwareScrollView.props.children[2];
      const formChildren = formView.props.children;

      const emailInput = formChildren[0];
      const passwordInput = formChildren[1];

      assert.equal(emailInput.props.name, 'email');
      assert.equal(emailInput.props.returnKeyType, 'next');
      assert.equal(emailInput.props.blurOnSubmit, false);
      assert.equal(typeof emailInput.props.onSubmitEditing, 'function');

      assert.equal(passwordInput.props.name, 'password');
      assert.equal(passwordInput.props.returnKeyType, 'done');
      assert.equal(typeof passwordInput.props.onSubmitEditing, 'function');

      // Verify password Done triggers Keyboard.dismiss
      dismissedCalls.count = 0;
      passwordInput.props.onSubmitEditing();
      assert.equal(dismissedCalls.count, 1, 'Password Done action must dismiss keyboard');
    });
  });

  describe('3. Register Screen Native Keyboard Configuration', () => {
    it('renders Register screen successfully with all 4 form fields and sticky button', () => {
      const registerElement = React.createElement(RegisterScreen);
      const html = renderToStaticMarkup(registerElement);

      assert.match(html, /Create Account/);
      assert.match(html, /Start your fitness journey today/);
      assert.match(html, /Full Name/);
      assert.match(html, /Email/);
      assert.match(html, /Password/);
      assert.match(html, /Confirm Password/);
      assert.match(html, /Sign Up/);
    });

    it('Register screen chains fields: Name -> Email -> Password -> Confirm Password -> Keyboard.dismiss', () => {
      let renderedTree: any = null;
      function TestWrapper() {
        renderedTree = RegisterScreen();
        return renderedTree;
      }
      renderToStaticMarkup(React.createElement(TestWrapper));

      assert.notEqual(renderedTree, null);
      // Header is at index 0, KeyboardAwareScrollView is at index 1, KeyboardStickyView is at index 2
      const keyboardAwareScrollView = renderedTree.props.children[1];
      const stickyFooterView = renderedTree.props.children[2];

      assert.equal(keyboardAwareScrollView.props.bottomOffset, 88);
      assert.equal(keyboardAwareScrollView.props.keyboardShouldPersistTaps, 'handled');
      assert.notEqual(stickyFooterView, null, 'Register sticky button view must be present');

      const stickyButton = stickyFooterView.props.children;
      assert.equal(stickyButton.props.title, 'Sign Up');

      const formView = keyboardAwareScrollView.props.children[2];
      const formChildren = formView.props.children;

      const nameInput = formChildren[0];
      const emailInput = formChildren[1];
      const passwordInput = formChildren[2];
      const confirmPasswordInput = formChildren[3];

      // Step 1: Name -> Next
      assert.equal(nameInput.props.name, 'name');
      assert.equal(nameInput.props.returnKeyType, 'next');
      assert.equal(nameInput.props.blurOnSubmit, false);
      assert.equal(typeof nameInput.props.onSubmitEditing, 'function');

      // Step 2: Email -> Next
      assert.equal(emailInput.props.name, 'email');
      assert.equal(emailInput.props.returnKeyType, 'next');
      assert.equal(emailInput.props.blurOnSubmit, false);
      assert.equal(typeof emailInput.props.onSubmitEditing, 'function');

      // Step 3: Password -> Next
      assert.equal(passwordInput.props.name, 'password');
      assert.equal(passwordInput.props.returnKeyType, 'next');
      assert.equal(passwordInput.props.blurOnSubmit, false);
      assert.equal(typeof passwordInput.props.onSubmitEditing, 'function');

      // Step 4: Confirm Password -> Done
      assert.equal(confirmPasswordInput.props.name, 'confirmPassword');
      assert.equal(confirmPasswordInput.props.returnKeyType, 'done');
      assert.equal(typeof confirmPasswordInput.props.onSubmitEditing, 'function');

      // Confirm Password Done action dismisses keyboard
      dismissedCalls.count = 0;
      confirmPasswordInput.props.onSubmitEditing();
      assert.equal(dismissedCalls.count, 1, 'Confirm Password Done action must dismiss keyboard');
    });
  });

  describe('4. Form Validation & Incomplete Submission Safety', () => {
    it('loginSchema enforces validation rules before submission', () => {
      const emptyCheck = loginSchema.safeParse({ email: '', password: '' });
      assert.equal(emptyCheck.success, false);

      const invalidEmailCheck = loginSchema.safeParse({ email: 'bad-email', password: 'secretpassword' });
      assert.equal(invalidEmailCheck.success, false);

      const validCheck = loginSchema.safeParse({ email: 'fit@onus.com', password: 'secretpassword' });
      assert.equal(validCheck.success, true);
    });

    it('registerSchema enforces minimum 12 char password and matching confirmation', () => {
      const shortPass = registerSchema.safeParse({
        name: 'Alex Athlete',
        email: 'alex@fitonus.test',
        password: 'short',
        confirmPassword: 'short',
      });
      assert.equal(shortPass.success, false);

      const mismatch = registerSchema.safeParse({
        name: 'Alex Athlete',
        email: 'alex@fitonus.test',
        password: 'LongEnoughPassword123!',
        confirmPassword: 'MismatchPassword123!',
      });
      assert.equal(mismatch.success, false);

      const valid = registerSchema.safeParse({
        name: 'Alex Athlete',
        email: 'alex@fitonus.test',
        password: 'LongEnoughPassword123!',
        confirmPassword: 'LongEnoughPassword123!',
      });
      assert.equal(valid.success, true);
    });
  });
});
