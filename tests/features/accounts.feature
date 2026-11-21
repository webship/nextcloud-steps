@accounts
Feature: The accounts page of an administrator
  As the administrator of the site
  I want to see the accounts, their groups, and the refusal of a taken name
  So that I know who works on the site, without a suite ever making or deleting an account

  Scenario: The administrator sees the accounts and their groups
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    Then the account list should show "administrator"
    And the account list should show "editor"
    And the account list should show "user"
    And the account "administrator" should be in the group "admin"
    And the account "editor" should not be in the group "admin"

  Scenario: The search of the accounts
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    And I search the accounts for "edit"
    Then the account list should show "editor"
    And the account list should not show "user"

  Scenario: The list of the administrators
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    And I open the "Admins" account list
    Then the account list should show "administrator"
    And the account list should not show "editor"

  # The browser logs the refused request (400).
  @js-off
  Scenario: A taken account name is refused
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    And I try to create the account "editor"
    Then the new account should be refused with "User already exists"

  # The browser logs the refused request (403).
  @js-off
  Scenario: An account without the right is refused the accounts page
    Given I am a logged in user with the "user" user
    When I go to the accounts page
    Then I should see the error page "Access forbidden"
