@search
Feature: The unified search
  As a person looking for something on the server
  I want one search for files, apps and settings
  So that I find it wherever it is

  Scenario: A file is found by a part of its name and opened
    Given "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I search for "team" in the unified search
    Then the unified search should find "team-photo.png" in "Files"
    And the unified search should not find "annual-report.pdf" in "Files"
    When I open the search result "team-photo.png"
    Then the viewer should show the image "team-photo.png"

  Scenario: An app is found by its name
    Given I am a logged in user with the "user" user
    When I search for "activ" in the unified search
    Then the unified search should find "Activity" in "Apps"

  Scenario: A term nothing has
    Given I am a logged in user with the "user" user
    When I search for "zzqx-nothing" in the unified search
    Then the unified search should find nothing
