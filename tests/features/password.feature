@password
Feature: A forgotten password
  As a person who forgot their password
  I want a reset link by mail and a new password from it
  So that I reach my files again without an administrator

  Scenario: A reset link is sent by mail to the account
    Given I am on the login page
    When I ask for a password reset link for "user"
    Then I should see "If this account exists, a password reset message has been sent to its email address."
    And an email about "password reset" should be sent to "user"

  Scenario: An address without an account gets the same answer and no mail
    Given I am on the login page
    When I ask for a password reset link for "nobody@example.com"
    Then I should see "If this account exists"
    And no email should be sent to "nobody@example.com"

  Scenario: The new password from the reset link is the one that logs in
    Given I am on the login page
    When I ask for a password reset link for "user"
    And I open the password reset link of the email to "user"
    And I choose the new password "Webship-New-Pass-2026"
    Then I should be on the login page
    When I log in as "user" with the login form
    Then I should be logged in as "user"
