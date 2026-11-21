@notifications
Feature: Notifications
  As a person with an account
  I want the notices for me in the notifications menu
  So that I read them and put them away

  Scenario: A notification is shown and dismissed
    Given "user" has the notification "Quarterly review is due" saying "Please send your figures by Friday."
    And I am a logged in user with the "user" user
    When I open the notifications
    Then the notifications should show "Quarterly review is due"
    And the notifications should show "Please send your figures by Friday."
    When I dismiss the notification "Quarterly review is due"
    Then the notifications should not show "Quarterly review is due"

  Scenario: Every notification is dismissed at once
    Given "user" has the notification "Budget meeting moved"
    And "user" has the notification "Server maintenance tonight"
    And I am a logged in user with the "user" user
    When I open the notifications
    Then the notifications should show "Budget meeting moved"
    When I dismiss all notifications
    Then I should have no notifications
